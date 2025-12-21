import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type ErrorType = 
  | 'javascript_error' 
  | 'react_error' 
  | 'api_error' 
  | 'network_error' 
  | 'unhandled_rejection';

interface ErrorLogEntry {
  error_type: ErrorType;
  error_message: string;
  stack_trace?: string;
  component_name?: string;
  url?: string;
  user_id?: string;
  user_agent?: string;
  metadata?: Json;
}

class ErrorLogger {
  private static instance: ErrorLogger;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): ErrorLogger {
    if (!ErrorLogger.instance) {
      ErrorLogger.instance = new ErrorLogger();
    }
    return ErrorLogger.instance;
  }

  async logError(entry: ErrorLogEntry): Promise<void> {
    try {
      // Get current user if available
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('error_logs')
        .insert([{
          error_type: entry.error_type,
          error_message: entry.error_message,
          stack_trace: entry.stack_trace || null,
          component_name: entry.component_name || null,
          url: entry.url || window.location.href,
          user_id: user?.id || null,
          user_agent: navigator.userAgent,
          metadata: entry.metadata || {},
        }]);

      if (error) {
        console.error('[ErrorLogger] Failed to log error to database:', error);
      }
    } catch (e) {
      console.error('[ErrorLogger] Exception while logging error:', e);
    }
  }

  initGlobalHandlers(): void {
    if (this.isInitialized) return;

    // Handle uncaught JavaScript errors
    window.onerror = (message, source, lineno, colno, error) => {
      this.logError({
        error_type: 'javascript_error',
        error_message: String(message),
        stack_trace: error?.stack || `at ${source}:${lineno}:${colno}`,
        url: window.location.href,
        metadata: {
          source: source || null,
          lineno: lineno || null,
          colno: colno || null,
        } as Json,
      });
      return false; // Let the error propagate
    };

    // Handle unhandled promise rejections
    window.onunhandledrejection = (event) => {
      const error = event.reason;
      this.logError({
        error_type: 'unhandled_rejection',
        error_message: error?.message || String(error),
        stack_trace: error?.stack,
        url: window.location.href,
        metadata: {
          reason: String(error),
        } as Json,
      });
    };

    this.isInitialized = true;
    console.log('[ErrorLogger] Global error handlers initialized');
  }

  // Helper for logging API errors
  logApiError(endpoint: string, error: unknown, metadata?: Record<string, Json>): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    
    this.logError({
      error_type: 'api_error',
      error_message: `API Error: ${endpoint} - ${errorMessage}`,
      stack_trace: stack,
      url: window.location.href,
      metadata: {
        endpoint,
        ...metadata,
      } as Json,
    });
  }

  // Helper for logging React component errors
  logReactError(error: Error, componentName: string, errorInfo?: React.ErrorInfo): void {
    this.logError({
      error_type: 'react_error',
      error_message: error.message,
      stack_trace: error.stack,
      component_name: componentName,
      url: window.location.href,
      metadata: {
        componentStack: errorInfo?.componentStack || null,
      } as Json,
    });
  }

  // Helper for logging network errors
  logNetworkError(url: string, status: number, statusText: string): void {
    this.logError({
      error_type: 'network_error',
      error_message: `Network Error: ${status} ${statusText} - ${url}`,
      url: window.location.href,
      metadata: {
        requestUrl: url,
        status,
        statusText,
      } as Json,
    });
  }
}

export const errorLogger = ErrorLogger.getInstance();
