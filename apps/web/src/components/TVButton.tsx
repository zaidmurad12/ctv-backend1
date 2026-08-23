import type { ReactNode } from 'react';
import Link from 'next/link';

export type TVButtonVariant = 'primary' | 'secondary' | 'ghost';

export function tvButtonClassName(variant: TVButtonVariant = 'primary', className = ''): string {
  const baseStyle =
    'px-5 py-2.5 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer select-none disabled:opacity-55 disabled:cursor-default';
  let variantStyle = 'bg-white text-black hover:bg-zinc-200';
  if (variant === 'secondary')
    variantStyle = 'bg-black/80 text-white border border-white/20 hover:border-white';
  else if (variant === 'ghost') variantStyle = 'bg-transparent text-zinc-300 hover:text-white';
  return `${baseStyle} ${variantStyle} ${className}`;
}

export const TVButton: React.FC<{
  variant?: TVButtonVariant;
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
}> = ({
  variant = 'primary',
  icon,
  children,
  onClick,
  type = 'button',
  disabled = false,
  className = '',
}) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={tvButtonClassName(variant, className)}
  >
    {icon}
    <span>{children}</span>
  </button>
);

export const TVLinkButton: React.FC<{
  href: string;
  variant?: TVButtonVariant;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}> = ({ href, variant = 'primary', icon, children, className = '' }) => (
  <Link href={href} className={tvButtonClassName(variant, className)}>
    {icon}
    <span>{children}</span>
  </Link>
);
