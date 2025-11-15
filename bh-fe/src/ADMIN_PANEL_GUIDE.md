# BioHax Admin Panel Documentation

## Overview

The BioHax HQ Admin Panel is a comprehensive backend administration system designed for super administrators to manage the entire BioHax platform. It provides full control over users, system health, database operations, security, and application configuration.

## Access

### How to Access the Admin Panel

1. **Login to the Platform**: First, authenticate as a user
2. **Admin Button**: Look for the purple/pink gradient floating button with a shield icon in the bottom-right corner
3. **Click to Enter**: Click the button to enter the Super Admin Control Panel
4. **Return**: Use the "Back to App" button in the admin header to return to the main application

**Note**: In production, this should be protected by role-based access control (RBAC) and only visible to users with super admin privileges.

## Features

### 1. Overview Dashboard
**Tab**: Overview

The main dashboard provides:
- **Quick Stats**: Total users, active sessions, system health, and critical alerts
- **Recent System Activity**: Real-time feed of important system events
- **Quick Actions**: One-click access to common admin tasks
  - Manage Users
  - Run Backup
  - Health Check
  - Security Scan

### 2. User Management
**Tab**: User Management

Complete user administration with:
- **User Statistics**: Total users, active users, practitioners, and suspended accounts
- **Search & Filters**: Find users by name, email, role, plan, and status
- **User Actions**:
  - Edit user details (name, email, role, plan)
  - Send emails to users
  - Suspend/Activate user accounts
  - Delete user accounts
- **User Roles**:
  - User (standard user)
  - Practitioner (health professionals)
  - Admin (platform administrators)
  - Super Admin (full platform access)
- **Subscription Plans**:
  - Explorer (Free)
  - Biohacker ($20/month)
  - Longevity Pro ($50/month)
- **Bulk Operations**: Export user data
- **Create New Users**: Add users directly from admin panel

### 3. System Health Monitor
**Tab**: Health Checks

Real-time system monitoring:
- **Overall Health Score**: Visual percentage of system operational status
- **Service Status**: Monitor all critical services
  - API Gateway
  - Database Primary & Replica
  - Cache Layer (Redis)
  - AI Engine - OpenBioLLM
  - AI Engine - Google Gemini
  - File Storage (S3)
  - Email Service
- **System Resources**:
  - CPU Usage
  - Memory Usage
  - Disk Usage
  - Network Usage
- **Incident History**: Track and review recent system incidents
- **Auto-Refresh**: Manual refresh capability for latest status

### 4. Database Status
**Tab**: Database

Comprehensive database management:
- **Database Instances**: Monitor all database servers
  - Primary Database (PostgreSQL)
  - Read Replicas
  - Redis Cache
- **Metrics per Instance**:
  - Active connections
  - CPU and Memory usage
  - Database size
  - Query performance
  - Latency
- **Table Statistics**:
  - Row counts
  - Table sizes
  - Index counts
  - Last vacuum time
- **Query Performance Analysis**:
  - Slow query detection
  - Execution counts
  - Average and max query times
- **Backup Status**:
  - Last full backup
  - Continuous archiving status
  - Next scheduled backup
- **Quick Actions**:
  - Manual backup
  - Database optimization
  - Refresh status

### 5. Application Configuration
**Tab**: Configuration

Manage all application settings:

**General Settings**:
- Application name and URL
- Support email
- Default language (English/Romanian)
- Maintenance mode toggle
- User registration toggle

**Email Configuration**:
- SMTP settings (host, port, username, password)
- From email and name
- Test email functionality

**AI Engines**:
- **OpenBioLLM Configuration**:
  - API endpoint
  - API key
  - Model version
  - Enable/disable toggle
- **Google Gemini Configuration**:
  - API key
  - Model version
  - Enable/disable toggle

**Payment Settings**:
- Stripe publishable and secret keys
- Webhook secret
- Test mode toggle
- Pricing configuration for each tier

**API Keys**:
- AWS credentials
- SendGrid API key
- Twilio credentials
- Other external services

**Security Settings**:
- Two-factor authentication requirements
- HIPAA compliance mode
- GDPR compliance mode
- Session timeout
- Max login attempts

### 6. Security Center
**Tab**: Security

Comprehensive security management:
- **Security Health Score**: Visual score out of 100
- **Security Status Indicators**:
  - SSL/TLS Encryption
  - Firewall Protection
  - Password Policy
- **Security Settings**:
  - Auto-block suspicious IPs
  - Require 2FA for admins
  - HIPAA audit logging
  - Data encryption at rest
- **Active Threats**:
  - Real-time threat monitoring
  - Threat severity levels (Low, Medium, High, Critical)
  - Threat types: brute force, intrusion, suspicious IP, data breach attempts
- **Blocked IP Addresses**:
  - View all blocked IPs
  - Reason for block
  - Number of attempts
  - Unblock functionality
- **Quick Actions**:
  - Run security scan
  - Update firewall rules
  - Rotate API keys

### 7. Audit Logs
**Tab**: Audit Logs

Complete audit trail of all system activities:
- **Statistics**: Total events, successful, warnings, and errors
- **Search & Filter**: By user, action, category, and status
- **Log Categories**:
  - Authentication (auth)
  - Data Operations (data)
  - Configuration (config)
  - Security (security)
- **Log Details**:
  - Timestamp
  - User who performed action
  - Action description
  - Resource affected
  - IP address
  - Status (success, warning, error)
  - Detailed information
- **Export Capability**: Download audit logs for compliance
- **Detailed View**: Click to view complete log entry

### 8. System Metrics
**Tab**: Metrics

Analytics and performance metrics:
- **Key Metrics**:
  - Total users with growth trends
  - Monthly Recurring Revenue (MRR)
  - Average session duration
  - API calls per day
- **Charts**:
  - **User Growth**: 7-month trend chart
  - **Revenue**: Monthly revenue line chart
  - **API Usage**: 24-hour usage bar chart
  - **Plan Distribution**: Pie chart showing user distribution across plans
- **Feature Adoption**:
  - Biomarker Tracking usage
  - AI Protocols usage
  - Lab Upload usage
  - Practitioner collaboration
  - Community engagement
  - Integrations usage
- **Real-time Stats**:
  - Users active now
  - Today's signups
  - Average response time

### 9. Backup Management
**Tab**: Backups

Database backup and recovery:
- **Overview Statistics**:
  - Total backup size
  - Last backup time
  - Next scheduled backup
  - Retention period
- **Backup Configuration**:
  - Automatic backups toggle
  - Backup frequency (hourly, daily, weekly)
  - Backup type (full, incremental, differential)
  - Storage location (S3, GCS, Azure, Local)
- **Backup History**:
  - List of all backups with details
  - Backup type, size, duration, status
  - Restore from backup
  - Download backup
  - Delete backup
- **Recovery Objectives**:
  - Recovery Point Objective (RPO)
  - Recovery Time Objective (RTO)
  - Last recovery test
  - Test recovery process
- **Manual Actions**:
  - Initiate manual backup
  - Run backup immediately

## Technical Implementation

### Components Structure

```
/components/admin/
├── AdminDashboard.tsx          # Main admin panel container
├── UserManagement.tsx          # User CRUD operations
├── SystemHealthMonitor.tsx     # System health checks
├── DatabaseStatus.tsx          # Database monitoring
├── ApplicationConfig.tsx       # App configuration
├── SecurityCenter.tsx          # Security management
├── AuditLogs.tsx              # Audit trail
├── SystemMetrics.tsx          # Analytics & metrics
└── BackupManagement.tsx       # Backup operations
```

### Design System

The admin panel uses a consistent neo-brutalist design with:
- **Dark Theme**: Gradient background from slate to purple
- **Color Coding**:
  - Purple: General/Primary actions
  - Green: Success states, active/healthy
  - Blue: Information, secondary actions
  - Yellow/Orange: Warnings
  - Red: Errors, critical alerts
- **Cards**: All content in card components with borders
- **Badges**: Status indicators with icons
- **Tables**: Responsive tables for data display
- **Charts**: Recharts library for visualizations

### State Management

- Local state management using React hooks
- Mock data for demonstration
- Toast notifications for user feedback (Sonner)
- Responsive design for desktop, tablet, and mobile

## Integration Points

### Future Backend Integration

The admin panel is designed to integrate with backend APIs:

1. **User Management API**:
   - `GET /api/admin/users` - List users
   - `POST /api/admin/users` - Create user
   - `PUT /api/admin/users/:id` - Update user
   - `DELETE /api/admin/users/:id` - Delete user
   - `POST /api/admin/users/:id/suspend` - Suspend user
   - `POST /api/admin/users/:id/activate` - Activate user

2. **System Health API**:
   - `GET /api/admin/health` - System health status
   - `GET /api/admin/health/services` - Service status
   - `GET /api/admin/health/resources` - Resource metrics

3. **Database API**:
   - `GET /api/admin/database/status` - Database status
   - `POST /api/admin/database/backup` - Trigger backup
   - `POST /api/admin/database/optimize` - Optimize database

4. **Configuration API**:
   - `GET /api/admin/config` - Get configuration
   - `PUT /api/admin/config` - Update configuration

5. **Security API**:
   - `GET /api/admin/security/threats` - Active threats
   - `GET /api/admin/security/blocked-ips` - Blocked IPs
   - `POST /api/admin/security/scan` - Run security scan

6. **Audit API**:
   - `GET /api/admin/audit-logs` - Fetch audit logs
   - `GET /api/admin/audit-logs/:id` - Get log details

7. **Metrics API**:
   - `GET /api/admin/metrics/users` - User metrics
   - `GET /api/admin/metrics/revenue` - Revenue metrics
   - `GET /api/admin/metrics/api-usage` - API usage

8. **Backup API**:
   - `GET /api/admin/backups` - List backups
   - `POST /api/admin/backups` - Create backup
   - `POST /api/admin/backups/:id/restore` - Restore backup
   - `DELETE /api/admin/backups/:id` - Delete backup

## Security Considerations

### Production Recommendations

1. **Authentication**:
   - Implement proper authentication (JWT, OAuth)
   - Verify super admin role before allowing access
   - Session management with timeout

2. **Authorization**:
   - Role-based access control (RBAC)
   - Permission checks for each admin action
   - Audit all admin actions

3. **Security**:
   - HTTPS only
   - CSRF protection
   - Rate limiting
   - Input validation and sanitization
   - SQL injection prevention

4. **Compliance**:
   - HIPAA compliance for health data
   - GDPR compliance for EU users
   - Data encryption at rest and in transit
   - Comprehensive audit logging

5. **Access Control**:
   - Hide admin button for non-admin users
   - IP whitelisting for admin access
   - Multi-factor authentication required
   - Regular security audits

## Deployment

### Environment Variables

The following environment variables should be configured:

```env
# Database
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# AI Engines
OPENBIO_API_KEY=...
OPENBIO_ENDPOINT=...
GEMINI_API_KEY=...

# Email
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=...
FROM_EMAIL=noreply@biohax.com

# Payment
STRIPE_PUBLIC_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Storage
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET=biohax-backups

# Security
JWT_SECRET=...
SESSION_SECRET=...
ENCRYPTION_KEY=...
```

## Usage Examples

### Creating a New User

1. Navigate to User Management tab
2. Click "Add User" button
3. Fill in user details (name, email, role, plan)
4. Click "Create User"
5. User receives welcome email with credentials

### Running a Manual Backup

1. Navigate to Backups tab
2. Click "Manual Backup" button
3. Wait for backup to complete (progress shown)
4. Backup appears in history table

### Reviewing Security Threats

1. Navigate to Security Center tab
2. Review Active Security Threats section
3. Check threat severity and status
4. Take appropriate action (already blocked, investigating, etc.)

### Checking System Health

1. Navigate to Health Checks tab
2. View Overall System Health score
3. Review individual service statuses
4. Click "Refresh" for latest data
5. Review any incidents in incident history

### Exporting Audit Logs

1. Navigate to Audit Logs tab
2. Apply filters as needed (category, status, date range)
3. Click "Export" button
4. Download CSV file with filtered logs

## Support

For admin panel issues or questions:
- Email: admin-support@biohax.com
- Slack: #admin-support channel
- Documentation: https://docs.biohax.com/admin

## Changelog

### Version 1.0.0 (November 2025)
- Initial admin panel implementation
- Complete user management
- System health monitoring
- Database status and management
- Application configuration
- Security center
- Audit logging
- System metrics and analytics
- Backup management
- Neo-brutalist design system
- Responsive layout for all screen sizes

---

**Note**: This admin panel contains mock data for demonstration purposes. In production, all data will be fetched from secure backend APIs with proper authentication and authorization.
