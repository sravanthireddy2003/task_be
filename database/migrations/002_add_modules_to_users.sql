-- Migration: add `modules` column to `users` table so we can store module access JSON
ALTER TABLE users
  ADD COLUMN modules TEXT NULL;

-- If you'd prefer the native JSON type (MySQL 5.7+ / MariaDB 10.2+), you can use:
-- ALTER TABLE users ADD COLUMN modules JSON NULL;
