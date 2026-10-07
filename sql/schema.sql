-- Run in the database configured by DB_NAME. Requires MySQL 8.0+.
CREATE TABLE categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

-- Each book row represents one physical copy.
CREATE TABLE books (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  author VARCHAR(255) NOT NULL,
  category_id INT NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id)
) ENGINE=InnoDB;

CREATE TABLE rental (
  id INT AUTO_INCREMENT PRIMARY KEY,
  book_id INT NOT NULL,
  user_id INT NOT NULL,
  rented_at DATETIME(3) NOT NULL,
  due_at DATETIME(3) NOT NULL,
  returned_at DATETIME(3) NULL,
  active_book_id INT GENERATED ALWAYS AS (
    CASE WHEN returned_at IS NULL THEN book_id ELSE NULL END
  ) STORED,
  UNIQUE KEY one_active_rental_per_book (active_book_id),
  INDEX rental_book_returned (book_id, returned_at),
  FOREIGN KEY (book_id) REFERENCES books(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
