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
    const { name, cellphone, classroom, borrow_date, borrow_time_start, borrow_time_end, occupyReason } = req.body;

    try {
        const borrowDayOfWeek = new Date(borrow_date).getDay(); // 獲取星期幾（0=周日，1=周一，...）

        // 將時間轉換為24小時制的 Date 物件進行比較
        const [borrowStartHour, borrowStartMinute] = borrow_time_start.split(":").map(Number);
        const [borrowEndHour, borrowEndMinute] = borrow_time_end.split(":").map(Number);
        
        const borrowStartTime = new Date(borrow_date);
        borrowStartTime.setHours(borrowStartHour, borrowStartMinute, 0);
        
        const borrowEndTime = new Date(borrow_date);
        borrowEndTime.setHours(borrowEndHour, borrowEndMinute, 0);

        // 檢查是否與已有預約衝突
        const [existingReservations] = await db.query(
            `SELECT * FROM reservations 
             WHERE classroom = ? 
             AND borrow_date = ? 
             AND (
                 (borrow_time_start < ? AND borrow_time_end > ?) OR
                 (borrow_time_start < ? AND borrow_time_end > ?) OR
                 (borrow_time_start >= ? AND borrow_time_end <= ?)
             )`,
            [
                classroom,
                borrow_date,
                borrowEndTime.toISOString(),
                borrowEndTime.toISOString(),
                borrowStartTime.toISOString(),
                borrowStartTime.toISOString(),
                borrowStartTime.toISOString(),
                borrowEndTime.toISOString(),
            ]
        );

        if (existingReservations.length > 0) {
            return res.json({ success: false, message: '該時段已被預約！' });
        }

        // 檢查是否與課表衝突
        const [scheduleConflicts] = await db.query(
            `SELECT * FROM class_schedules
             WHERE classroom = ?
             AND day_of_week = ?`,
            [classroom, borrowDayOfWeek]
        );

        // 檢查時間是否與課程時間段重疊
        const timeConflicts = scheduleConflicts.filter(course => {
            const [courseStartHour, courseStartMinute] = course.start_time.split(":").map(Number);
            const [courseEndHour, courseEndMinute] = course.end_time.split(":").map(Number);

            const courseStartTime = new Date(borrow_date);
            courseStartTime.setHours(courseStartHour, courseStartMinute, 0);

            const courseEndTime = new Date(borrow_date);
            courseEndTime.setHours(courseEndHour, courseEndMinute, 0);

            // 檢查時間是否重疊
            return (borrowStartTime < courseEndTime && borrowEndTime > courseStartTime);
        });

        if (timeConflicts.length > 0) {
            return res.json({ success: false, message: '該時段教室有課程！' });
        }

        // 插入新的預約記錄
        await db.query(
            `INSERT INTO reservations (user_id, name, cellphone, classroom, borrow_date, borrow_time_start, borrow_time_end, occupyReason)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, name, cellphone, classroom, borrow_date, borrow_time_start, borrow_time_end, occupyReason]
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});


//檢查課表衝突
app.post('/api/class-schedule', async (req, res) => {
    const { classroom, borrow_date, borrow_time_start, borrow_time_end } = req.body;

    try {
        const dayOfWeek = new Date(borrow_date).getDay();
        const weekDay = dayOfWeek === 0 ? 7 : dayOfWeek;

        // 將借用的時間轉換為 Date 物件
        const [startHour, startMinute] = borrow_time_start.split(":").map(Number);
        const [endHour, endMinute] = borrow_time_end.split(":").map(Number);

        const borrowStartTime = new Date(borrow_date);
        borrowStartTime.setHours(startHour, startMinute, 0);

        const borrowEndTime = new Date(borrow_date);
        borrowEndTime.setHours(endHour, endMinute, 0);

        // 查詢該日期和教室的所有課程
        const [conflicts] = await db.query(
            `SELECT * FROM class_schedules 
             WHERE classroom = ? 
             AND day_of_week = ?`,
            [classroom, weekDay]
        );

        // 檢查時間是否與課程時間段重疊
        const timeConflicts = conflicts.filter(course => {
            const [courseStartHour, courseStartMinute] = course.start_time.split(":").map(Number);
            const [courseEndHour, courseEndMinute] = course.end_time.split(":").map(Number);

            const courseStartTime = new Date(borrow_date);
            courseStartTime.setHours(courseStartHour, courseStartMinute, 0);

            const courseEndTime = new Date(borrow_date);
            courseEndTime.setHours(courseEndHour, courseEndMinute, 0);

            // 檢查時間是否重疊
            return (borrowStartTime < courseEndTime && borrowEndTime > courseStartTime);
        });

        res.json({ success: true, conflicts: timeConflicts });
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
app.post('/api/logout', (req, res) => {
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
