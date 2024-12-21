CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    cellphone VARCHAR(20),
    department VARCHAR(50),
    password VARCHAR(255) NOT NULL
);

CREATE TABLE reservations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(100),
    cellphone VARCHAR(20),
    classroom VARCHAR(50),
    borrow_date DATE NOT NULL,
    borrow_time TIME NOT NULL,
    occupyReason VARCHAR(255),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE class_schedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    classroom VARCHAR(50) NOT NULL,
    class_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    class_name VARCHAR(100) NOT NULL
);
