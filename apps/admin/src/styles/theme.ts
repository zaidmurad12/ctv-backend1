import { createTheme, type Theme } from '@mui/material/styles';

export type ThemeMode = 'light' | 'dark';

export function createAppTheme(mode: ThemeMode): Theme {
  return createTheme({
    palette: {
      mode,
      primary: { main: '#3f6fd8' },
      secondary: { main: '#d83f8f' },
      ...(mode === 'dark'
        ? { background: { default: '#0f1420', paper: '#161d2e' } }
        : { background: { default: '#f4f6fb', paper: '#ffffff' } }),
    },
    shape: { borderRadius: 8 },
    typography: {
      fontFamily: [
        '-apple-system',
        'BlinkMacSystemFont',
        '"Segoe UI"',
        'Roboto',
        '"Helvetica Neue"',
        'Arial',
        'sans-serif',
      ].join(','),
    },
    components: {
      MuiAppBar: {
        defaultProps: { elevation: 0 },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { backgroundImage: 'none' },
        },
      },
    },
  });
}
