const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors({
    origin: ['stellar-paprenjak-3b01e7.netlify.app', 'http://localhost:3000', '*'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Configuração do banco MySQL
const dbConfig = {
    host: process.env.DB_HOST || '82.29.60.164',
    user: process.env.DB_USER || 'fribest',
    password: process.env.DB_PASSWORD || 'fribest',
    database: process.env.DB_NAME || 'sistema_controle',
    charset: 'utf8mb4',
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true
};

let connectionPool;

// Criar pool de conexões
function createConnectionPool() {
    connectionPool = mysql.createPool({
        ...dbConfig,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
    
    console.log('✅ Pool de conexões MySQL criado');
}

// Inicializar pool
createConnectionPool();

// Middleware para verificar conexão
async function checkConnection(req, res, next) {
    try {
        const connection = await connectionPool.getConnection();
        await connection.ping();
        connection.release();
        next();
    } catch (error) {
        console.error('❌ Erro na conexão MySQL:', error);
        res.status(500).json({ 
            error: 'Erro de conexão com banco de dados',
            details: error.message 
        });
    }
}

// Rota de teste e health check
app.get('/', (req, res) => {
    res.json({ 
        message: '🚀 API Sistema de Controle funcionando!',
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

app.get('/health', async (req, res) => {
    try {
        const connection = await connectionPool.getConnection();
        await connection.ping();
        connection.release();
        
        res.json({
            status: 'healthy',
            database: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            database: 'disconnected',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ===================== ROTAS DA API =====================

// GET - Buscar todos os registros ou pesquisar
app.get('/api/registros', checkConnection, async (req, res) => {
    try {
        const { search, limit = 100, offset = 0 } = req.query;
        
        let sql = 'SELECT * FROM registros';
        let params = [];
        
        if (search && search.trim()) {
            sql += ` WHERE 
                cliente LIKE ? OR 
                placa LIKE ? OR 
                marca LIKE ? OR 
                modelo LIKE ? OR 
                lote LIKE ? OR
                telefone LIKE ?`;
            const searchTerm = `%${search.trim()}%`;
            params = [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm];
        }
        
        sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        const [rows] = await connectionPool.execute(sql, params);
        
        res.json({
            success: true,
            data: rows,
            count: rows.length,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });
    } catch (error) {
        console.error('Erro ao buscar registros:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro ao buscar registros',
            details: error.message 
        });
    }
});

// GET - Buscar um registro específico
app.get('/api/registros/:id', checkConnection, async (req, res) => {
    try {
        const [rows] = await connectionPool.execute(
            'SELECT * FROM registros WHERE id = ?',
            [req.params.id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Registro não encontrado' 
            });
        }
        
        res.json({
            success: true,
            data: rows[0]
        });
    } catch (error) {
        console.error('Erro ao buscar registro:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro ao buscar registro',
            details: error.message 
        });
    }
});

// POST - Criar novo registro
app.post('/api/registros', checkConnection, async (req, res) => {
    try {
        const {
            lote, anuncio, cliente, telefone, marca, modelo, ano, placa,
            autorizacao, banco, pagamento, agendamento, retirada, retirado,
            data_pagamento, atpv, nome_cv, prazo_atpv, atpv_entregue,
            data_evento, custo, venda, comissao, valor_comissao, lucro
        } = req.body;

        // Validações básicas
        if (!lote || !anuncio || !cliente || !telefone || !marca || !modelo || !ano || !placa) {
            return res.status(400).json({
                success: false,
                error: 'Campos obrigatórios não preenchidos',
                required: ['lote', 'anuncio', 'cliente', 'telefone', 'marca', 'modelo', 'ano', 'placa']
            });
        }
        
        const sql = `INSERT INTO registros (
            lote, anuncio, cliente, telefone, marca, modelo, ano, placa,
            autorizacao, banco, pagamento, agendamento, retirada, retirado,
            data_pagamento, atpv, nome_cv, prazo_atpv, atpv_entregue,
            data_evento, custo, venda, comissao, valor_comissao, lucro
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        const [result] = await connectionPool.execute(sql, [
            lote, anuncio, cliente, telefone, marca, modelo, parseInt(ano), placa,
            autorizacao || null, banco || null, 
            pagamento || null, agendamento || null, retirada || null, retirado || null,
            data_pagamento || null, atpv || null, nome_cv || null, prazo_atpv || null,
            atpv_entregue || null, data_evento || null,
            parseFloat(custo) || 0, parseFloat(venda) || 0, parseFloat(comissao) || 0,
            parseFloat(valor_comissao) || 0, parseFloat(lucro) || 0
        ]);
        
        res.status(201).json({ 
            success: true, 
            id: result.insertId,
            message: 'Registro criado com sucesso'
        });
    } catch (error) {
        console.error('Erro ao criar registro:', error);
        
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                error: 'Registro duplicado',
                details: 'Já existe um registro com estes dados'
            });
        }
        
        res.status(500).json({ 
            success: false,
            error: 'Erro ao criar registro',
            details: error.message 
        });
    }
});

// PUT - Atualizar registro
app.put('/api/registros/:id', checkConnection, async (req, res) => {
    try {
        const {
            lote, anuncio, cliente, telefone, marca, modelo, ano, placa,
            autorizacao, banco, pagamento, agendamento, retirada, retirado,
            data_pagamento, atpv, nome_cv, prazo_atpv, atpv_entregue,
            data_evento, custo, venda, comissao, valor_comissao, lucro
        } = req.body;
        
        const sql = `UPDATE registros SET 
            lote=?, anuncio=?, cliente=?, telefone=?, marca=?, modelo=?, ano=?, placa=?,
            autorizacao=?, banco=?, pagamento=?, agendamento=?, retirada=?, retirado=?,
            data_pagamento=?, atpv=?, nome_cv=?, prazo_atpv=?, atpv_entregue=?,
            data_evento=?, custo=?, venda=?, comissao=?, valor_comissao=?, lucro=?,
            updated_at=CURRENT_TIMESTAMP
            WHERE id=?`;
        
        const [result] = await connectionPool.execute(sql, [
            lote, anuncio, cliente, telefone, marca, modelo, parseInt(ano), placa,
            autorizacao || null, banco || null,
            pagamento || null, agendamento || null, retirada || null, retirado || null,
            data_pagamento || null, atpv || null, nome_cv || null, prazo_atpv || null,
            atpv_entregue || null, data_evento || null,
            parseFloat(custo) || 0, parseFloat(venda) || 0, parseFloat(comissao) || 0,
            parseFloat(valor_comissao) || 0, parseFloat(lucro) || 0,
            req.params.id
        ]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Registro não encontrado' 
            });
        }
        
        res.json({ 
            success: true,
            message: 'Registro atualizado com sucesso'
        });
    } catch (error) {
        console.error('Erro ao atualizar registro:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro ao atualizar registro',
            details: error.message 
        });
    }
});

// DELETE - Deletar registro
app.delete('/api/registros/:id', checkConnection, async (req, res) => {
    try {
        const [result] = await connectionPool.execute(
            'DELETE FROM registros WHERE id = ?',
            [req.params.id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Registro não encontrado' 
            });
        }
        
        res.json({ 
            success: true,
            message: 'Registro deletado com sucesso'
        });
    } catch (error) {
        console.error('Erro ao deletar registro:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro ao deletar registro',
            details: error.message 
        });
    }
});

// GET - Estatísticas
app.get('/api/estatisticas', checkConnection, async (req, res) => {
    try {
        const [rows] = await connectionPool.execute(`
            SELECT 
                COUNT(*) as total_registros,
                COALESCE(SUM(venda), 0) as total_vendas,
                COALESCE(SUM(valor_comissao), 0) as total_comissoes,
                COALESCE(SUM(lucro), 0) as total_lucro,
                COALESCE(AVG(venda), 0) as media_vendas,
                COALESCE(AVG(comissao), 0) as media_comissao
            FROM registros
        `);
        
        res.json({
            success: true,
            data: rows[0]
        });
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro ao buscar estatísticas',
            details: error.message 
        });
    }
});

// POST - Backup dos dados
app.get('/api/backup', checkConnection, async (req, res) => {
    try {
        const [rows] = await connectionPool.execute('SELECT * FROM registros ORDER BY id');
        
        res.json({
            success: true,
            backup_date: new Date().toISOString(),
            total_records: rows.length,
            data: rows
        });
    } catch (error) {
        console.error('Erro ao fazer backup:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro ao fazer backup',
            details: error.message 
        });
    }
});

// Middleware para rotas não encontradas
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Rota não encontrada',
        path: req.originalUrl,
        method: req.method
    });
});

// Middleware para tratamento de erros
app.use((error, req, res, next) => {
    console.error('Erro não tratado:', error);
    res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        details: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno'
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📡 API disponível em: http://localhost:${PORT}`);
    console.log(`🏥 Health check: http://localhost:${PORT}/health`);
    console.log(`📊 Estatísticas: http://localhost:${PORT}/api/estatisticas`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Finalizando servidor...');
    if (connectionPool) {
        await connectionPool.end();
        console.log('Pool de conexões fechado');
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('Finalizando servidor...');
    if (connectionPool) {
        await connectionPool.end();
        console.log('Pool de conexões fechado');
    }
    process.exit(0);
});
