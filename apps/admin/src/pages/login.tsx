import type { ReactElement } from 'react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, Box, Button, Paper, TextField, Typography } from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/apiError';
import type { NextPageWithLayout } from './_app';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const Login: NextPageWithLayout = () => {
  const { login } = useAuth();
  const [serverError, setServerError] = useState<string | undefined>(undefined);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginFormValues) {
    setServerError(undefined);
    try {
      await login(values.email, values.password);
    } catch (error) {
      setServerError(
        error instanceof ApiError ? error.message : 'Unable to sign in. Please try again.',
      );
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
        bgcolor: 'background.default',
      }}
    >
      <Paper variant="outlined" sx={{ p: 4, width: '100%', maxWidth: 400 }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          CTV Platform Admin
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Sign in with your administrator, editor, or viewer account.
        </Typography>

        {serverError ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {serverError}
          </Alert>
        ) : undefined}

        <Box
          component="form"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            error={Boolean(errors.email)}
            helperText={errors.email?.message}
            {...register('email')}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            error={Boolean(errors.password)}
            helperText={errors.password?.message}
            {...register('password')}
          />
          <Button type="submit" variant="contained" size="large" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};

Login.getLayout = (page: ReactElement) => page;

export default Login;
