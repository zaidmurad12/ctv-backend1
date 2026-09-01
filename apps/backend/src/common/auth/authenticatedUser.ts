/** The JWT payload shape attached to `Request.user` once authenticated. */
export interface AuthenticatedUser {
  readonly userId: string;
  readonly email: string;
  readonly role: 'ADMIN' | 'EDITOR' | 'VIEWER';
}
