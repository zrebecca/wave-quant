-- One-shot setup for a LOCAL (non-Docker) MySQL install.
-- Run as root:  mysql -u root < deploy/mysql/local_setup.sql
-- Creates the database and the 'okx' app user used by backend/.env.
-- Tables themselves are created automatically by the backend on startup.

CREATE DATABASE IF NOT EXISTS okx_dashboard
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'okx'@'localhost' IDENTIFIED BY 'okx_pass';
CREATE USER IF NOT EXISTS 'okx'@'127.0.0.1' IDENTIFIED BY 'okx_pass';

GRANT ALL PRIVILEGES ON okx_dashboard.* TO 'okx'@'localhost';
GRANT ALL PRIVILEGES ON okx_dashboard.* TO 'okx'@'127.0.0.1';
FLUSH PRIVILEGES;
