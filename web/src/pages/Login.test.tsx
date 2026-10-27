import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../lib/auth';
import { LoginPage } from './Login';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function renderLogin() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the server error when credentials are rejected', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Sign in required' })) // /auth/me on load
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Invalid email or password' })); // login
    vi.stubGlobal('fetch', fetchMock);

    renderLogin();
    await userEvent.type(await screen.findByLabelText('Email'), 'admin@bulkskart.test');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    const loginCall = fetchMock.mock.calls[1];
    expect(loginCall[0]).toBe('/api/auth/login');
    expect(loginCall[1].credentials).toBe('same-origin');
  });

  it('sends the email and password only to the same-origin login endpoint', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Sign in required' }))
      .mockResolvedValueOnce(jsonResponse(200, { email: 'admin@bulkskart.test' }))
      .mockResolvedValue(jsonResponse(200, []));
    vi.stubGlobal('fetch', fetchMock);

    renderLogin();
    await userEvent.type(await screen.findByLabelText('Email'), 'admin@bulkskart.test');
    await userEvent.type(screen.getByLabelText('Password'), 'correct-password-123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/login');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ email: 'admin@bulkskart.test', password: 'correct-password-123' });
  });
});
