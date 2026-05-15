'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-text-1 tabular-nums',
        'transition-[border-color,box-shadow] duration-fast ease-standard',
        'placeholder:text-text-3',
        'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn('text-sm font-medium text-text-2', className)} {...props} />
  )
);
Label.displayName = 'Label';
