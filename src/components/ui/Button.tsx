import React, { ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium transition-all duration-200 rounded-md disabled:opacity-40 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B2B] focus-visible:ring-offset-2';
  
  const variants = {
    primary: 'bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary-hover)] active:scale-[0.98]',
    secondary: 'bg-transparent border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]',
    ghost: 'bg-transparent border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
    danger: 'bg-[var(--error-bg)] text-[var(--error-text)] border border-[var(--error-border)] hover:opacity-90',
  };

  const sizes = {
    sm: 'h-[28px] px-3 text-[var(--text-xs)]',
    md: 'h-[36px] px-4 text-[var(--text-sm)]',
    lg: 'h-[44px] px-6 text-[var(--text-base)]',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          <span className="opacity-60">{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
};
