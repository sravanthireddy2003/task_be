-- Migration 008: Create Projects, Tasks, and Subtasks schema with department visibility

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  public_id VARCHAR(64) NOT NULL UNIQUE,
  client_id INT NOT NULL,
  project_manager_id INT,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status ENUM('Planning', 'Active', 'On Hold', 'Completed', 'Cancelled') DEFAULT 'Planning',
  priority ENUM('Low', 'Medium', 'High', 'Critical') DEFAULT 'Medium',
  start_date DATE,
  end_date DATE,
  budget DECIMAL(15, 2),
  is_active TINYINT(1) DEFAULT 1,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_client (client_id),
  INDEX idx_manager (project_manager_id),
  INDEX idx_status (status),
  FOREIGN KEY (client_id) REFERENCES clientss(id) ON DELETE CASCADE,
  FOREIGN KEY (project_manager_id) REFERENCES users(_id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Project-Department mapping table (Many-to-Many)
CREATE TABLE IF NOT EXISTS project_departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  department_id INT NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_project_dept (project_id, department_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tasks table (department-aware)
CREATE TABLE IF NOT EXISTS tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  public_id VARCHAR(64) NOT NULL UNIQUE,
  project_id INT NOT NULL,
  department_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status ENUM('New', 'Assigned', 'In Progress', 'Review', 'Completed', 'Closed') DEFAULT 'New',
  priority ENUM('Low', 'Medium', 'High', 'Critical') DEFAULT 'Medium',
  assigned_to INT,
  start_date DATE,
  due_date DATE,
  estimated_hours DECIMAL(8, 2),
  actual_hours DECIMAL(8, 2),
  progress_percentage INT DEFAULT 0,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_project (project_id),
  INDEX idx_department (department_id),
  INDEX idx_assigned_to (assigned_to),
  INDEX idx_status (status),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
  FOREIGN KEY (assigned_to) REFERENCES users(_id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Subtasks table
CREATE TABLE IF NOT EXISTS subtasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  public_id VARCHAR(64) NOT NULL UNIQUE,
  task_id INT NOT NULL,
  project_id INT NOT NULL,
  department_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status ENUM('Open', 'In Progress', 'Completed') DEFAULT 'Open',
  assigned_to INT,
  start_date DATE,
  due_date DATE,
  estimated_hours DECIMAL(8, 2),
  actual_hours DECIMAL(8, 2),
  progress_percentage INT DEFAULT 0,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_task (task_id),
  INDEX idx_project (project_id),
  INDEX idx_department (department_id),
  INDEX idx_assigned_to (assigned_to),
  INDEX idx_status (status),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
  FOREIGN KEY (assigned_to) REFERENCES users(_id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Task assignments table (track multiple assignees if needed)
CREATE TABLE IF NOT EXISTS task_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  user_id INT NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_task_user (task_id, user_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Subtask assignments table
CREATE TABLE IF NOT EXISTS subtask_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subtask_id INT NOT NULL,
  user_id INT NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_subtask_user (subtask_id, user_id),
  FOREIGN KEY (subtask_id) REFERENCES subtasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Activity log table for tasks
CREATE TABLE IF NOT EXISTS task_activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT,
  subtask_id INT,
  user_id INT,
  action VARCHAR(255),
  details TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_task (task_id),
  INDEX idx_subtask (subtask_id),
  INDEX idx_user (user_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  FOREIGN KEY (subtask_id) REFERENCES subtasks(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
