import { getAdminDb } from './firebaseAdmin';

export interface AuditLogEntry {
  userId: string;
  action: string;
  resource?: string;
  resourceId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  success: boolean;
  errorMessage?: string;
}

export class AuditLogger {
  private static instance: AuditLogger;
  private db: any;

  private constructor() {
    this.db = getAdminDb();
  }

  public static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  /**
   * Log a security-relevant action for audit purposes
   */
  public async log(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<void> {
    try {
      const auditEntry: AuditLogEntry = {
        ...entry,
        timestamp: new Date()
      };

      // Filter out undefined values to prevent Firestore errors
      const cleanAuditEntry = Object.fromEntries(
        Object.entries(auditEntry).filter(([_, value]) => value !== undefined)
      ) as AuditLogEntry;

      // Store in Firestore for compliance and monitoring
      await this.db.collection('auditLogs').add(cleanAuditEntry);

      // Also log to console for development/debugging
      console.log(`[AUDIT] ${entry.action} by ${entry.userId} - ${entry.success ? 'SUCCESS' : 'FAILED'}`);

      if (!entry.success && entry.errorMessage) {
        console.error(`[AUDIT] Error: ${entry.errorMessage}`);
      }
    } catch (error) {
      // Don't let audit logging failures break the main application
      console.error('[AUDIT] Failed to log audit entry:', error);
    }
  }

  /**
   * Log successful actions
   */
  public async logSuccess(
    userId: string,
    action: string,
    resource?: string,
    resourceId?: string,
    metadata?: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.log({
      userId,
      action,
      resource,
      resourceId,
      metadata,
      ipAddress,
      userAgent,
      success: true
    });
  }

  /**
   * Log failed actions
   */
  public async logFailure(
    userId: string,
    action: string,
    errorMessage: string,
    resource?: string,
    resourceId?: string,
    metadata?: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.log({
      userId,
      action,
      resource,
      resourceId,
      metadata,
      ipAddress,
      userAgent,
      success: false,
      errorMessage
    });
  }

  /**
   * Log authentication events
   */
  public async logAuth(
    userId: string,
    action: 'login' | 'logout' | 'login_failed' | 'token_refresh',
    success: boolean,
    ipAddress?: string,
    userAgent?: string,
    errorMessage?: string
  ): Promise<void> {
    await this.log({
      userId,
      action: `auth_${action}`,
      ipAddress,
      userAgent,
      success,
      errorMessage
    });
  }

  /**
   * Log data access events
   */
  public async logDataAccess(
    userId: string,
    resource: string,
    resourceId: string,
    action: 'read' | 'write' | 'delete',
    success: boolean,
    ipAddress?: string,
    userAgent?: string,
    errorMessage?: string
  ): Promise<void> {
    await this.log({
      userId,
      action: `data_${action}`,
      resource,
      resourceId,
      ipAddress,
      userAgent,
      success,
      errorMessage
    });
  }

  /**
   * Log admin actions
   */
  public async logAdminAction(
    adminUserId: string,
    action: string,
    targetUserId?: string,
    metadata?: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.log({
      userId: adminUserId,
      action: `admin_${action}`,
      resource: targetUserId ? 'user' : undefined,
      resourceId: targetUserId,
      metadata,
      ipAddress,
      userAgent,
      success: true
    });
  }
}

// Export singleton instance
export const auditLogger = AuditLogger.getInstance();
