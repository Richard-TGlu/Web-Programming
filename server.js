const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = 3000;

// 使用 express-session 中介軟體來管理 session
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
}));

// 中間件
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// MySQL 資料庫連線池
const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'classroom_reservation',
});

// 根路徑處理
app.get('/', (req, res) => {
    if (req.session.user) {
        return res.redirect('/main');
    }
    res.sendFile(path.join(__dirname, 'public/login.html'));
});

// 註冊
app.post('/api/register', async (req, res) => {
    const { student_id, name, cellphone, department, password } = req.body;
    try {
        const [existingUser] = await db.query('SELECT * FROM users WHERE student_id = ?', [student_id]);
        if (existingUser.length > 0) {
            return res.json({ success: false, message: '學號已被註冊！' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

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

// 登入
app.post('/api/login', async (req, res) => {
    const { student_id, password } = req.body;
    try {
        const [users] = await db.query('SELECT * FROM users WHERE student_id = ?', [student_id]);
        if (users.length === 0) {
            return res.json({ success: false, message: '學號不存在！' });
        }

        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.json({ success: false, message: '密碼錯誤！' });
        }

        req.session.user = { id: user.id, name: user.name, department: user.department };
        res.json({ success: true, user: { id: user.id, name: user.name, department: user.department } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 檢查 session 是否存在
app.get('/profile', (req, res) => {
    if (req.session.user) {
        return res.json({ success: true, user: req.session.user });
    }
    res.json({ success: false, message: '未登入' });
});

// 獲取個人資訊
app.get('/api/profile', async (req, res) => {
    if (!req.session.user) {
        return res.json({ success: false, message: '未登入！' });
    }

    const userId = req.session.user.id;
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

// 更新個人資訊
app.post('/api/profile', async (req, res) => {
    if (!req.session.user) {
        return res.json({ success: false, message: '未登入！' });
    }

    const userId = req.session.user.id;
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

// 提交預約
app.post('/api/reservations', async (req, res) => {
    if (!req.session.user) {
        return res.json({ success: false, message: '未登入！' });
    }

    const userId = req.session.user.id;
    const { name, cellphone, classroom, borrow_date, borrow_time, occupyReason } = req.body;

    try {
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

        await db.query(
            `INSERT INTO reservations (user_id, name, cellphone, classroom, borrow_date, borrow_time, occupyReason)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, name, cellphone, classroom, borrow_date, borrow_time, occupyReason]
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 獲取預約紀錄
app.get('/api/reservations', async (req, res) => {
    if (!req.session.user) {
        return res.json({ success: false, message: '未登入！' });
    }

    const userId = req.session.user.id;
    try {
        const [reservations] = await db.query('SELECT * FROM reservations WHERE user_id = ?', [userId]);
        res.json({ success: true, reservations });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 取消預約
app.post('/api/cancel-reservation', async (req, res) => {
    if (!req.session.user) {
        return res.json({ success: false, message: '未登入！' });
    }

    const reservationId = req.body.reservationId;
    try {
        await db.query('DELETE FROM reservations WHERE id = ?', [reservationId]);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 登出
app.get('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false, message: '登出失敗' });
        }
        res.json({ success: true });
    });
});

// 伺服器啟動
app.listen(PORT, () => {
    console.log(`伺服器運行於 http://localhost:${PORT}`);
});
