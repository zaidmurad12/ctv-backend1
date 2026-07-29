import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';

export type NotificationSeverity = 'success' | 'warning' | 'error' | 'info';

interface Notification {
  readonly id: number;
  readonly message: string;
  readonly severity: NotificationSeverity;
}

interface NotificationContextValue {
  readonly notify: (message: string, severity?: NotificationSeverity) => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

let nextId = 1;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Notification[]>([]);

  const notify = useCallback((message: string, severity: NotificationSeverity = 'info') => {
    setQueue((current) => [...current, { id: nextId++, message, severity }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setQueue((current) => current.filter((item) => item.id !== id));
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);
  const current = queue[0];

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <Snackbar
        open={Boolean(current)}
        autoHideDuration={5000}
        onClose={() => current && dismiss(current.id)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {current ? (
          <Alert
            onClose={() => dismiss(current.id)}
            severity={current.severity}
            variant="filled"
            sx={{ width: '100%' }}
          >
            {current.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </NotificationContext.Provider>
  );
}

export function useNotification(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}
