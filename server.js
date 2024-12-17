const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const PORT = 3000;

// 中間件
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public'))); // 提供靜態檔案

// MySQL 資料庫連線池
const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'zxc778899',
    database: 'classroom_reservation',
});

// 根路徑處理
app.get('/', (req, res) => {
    // 導向登入頁面
    res.sendFile(path.join(__dirname, 'public/login.html'));
});

//註冊
app.post('/api/register', async (req, res) => {
    const { student_id, name, cellphone, department, password } = req.body;
    try {
        // 檢查學號是否已存在
        const [existingUser] = await db.query('SELECT * FROM users WHERE student_id = ?', [student_id]);
        if (existingUser.length > 0) {
            return res.json({ success: false, message: '學號已被註冊！' });
        }

        // 加密密碼
        const hashedPassword = await bcrypt.hash(password, 10);

        // 儲存新用戶
        await db.query(
            'INSERT INTO users (student_id, name, cellphone, department, password) VALUES (?, ?, ?, ?, ?)',
            [student_id, name, cellphone, department, hashedPassword]
        );
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});
//登入
app.post('/api/login', async (req, res) => {
    const { student_id, password } = req.body;
    try {
        // 查詢用戶
        const [users] = await db.query('SELECT * FROM users WHERE student_id = ?', [student_id]);
        if (users.length === 0) {
            return res.json({ success: false, message: '學號不存在！' });
        }

        const user = users[0];
        // 驗證密碼
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.json({ success: false, message: '密碼錯誤！' });
        }

        // 登入成功，返回用戶資料
        res.json({ success: true, user: { id: user.id, name: user.name, department: user.department } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});
// API: 獲取個人資訊
app.get('/api/profile', async (req, res) => {
    const userId = req.query.userId;
    try {
        const [users] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
        if (users.length === 0) {
            return res.json({ success: false, message: '用戶不存在！' });
        }

        const user = users[0];
        res.json({ success: true, user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// API: 更新個人資訊
app.post('/api/profile', async (req, res) => {
    const userId = req.body.userId;
    const { name, cellphone, department } = req.body;
    try {
        await db.query(
            'UPDATE users SET name = ?, cellphone = ?, department = ? WHERE id = ?',
            [name, cellphone, department, userId]
        );
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

/// API: 提交預約
app.post('/api/reservations', async (req, res) => {
    const { name, cellphone, classroom, borrow_date, borrow_time, occupyReason } = req.body;

    try {
        // 檢查是否有衝突
        const [rows] = await db.query(
            `SELECT * FROM reservations 
             WHERE classroom = ? 
             AND borrow_date = ? 
             AND borrow_time = ?`,
            [classroom, borrow_date, borrow_time]
        );

        if (rows.length > 0) {
            return res.json({ success: false, message: '該時段已被預約！' });
        }

        // 插入新預約
        await db.query(
            `INSERT INTO reservations (name, cellphone, classroom, borrow_date, borrow_time, occupyReason)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [name, cellphone, classroom, borrow_date, borrow_time, occupyReason]
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// API: 獲取預約紀錄
app.get('/api/reservations', async (req, res) => {
    const userId = req.query.userId;
    try {
        const [reservations] = await db.query('SELECT * FROM reservations WHERE user_id = ?', [userId]);
        res.json({ success: true, reservations });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// API: 取消預約
app.post('/api/cancel-reservation', async (req, res) => {
    const reservationId = req.body.reservationId;
    try {
        await db.query('DELETE FROM reservations WHERE id = ?', [reservationId]);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

app.listen(PORT, () => {
    console.log(`伺服器運行於 http://localhost:${PORT}`);
});
