'use client';
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-all duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-1 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // 唯一品牌红主操作
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-e1',
        // 默认 = 中性深色 (非品牌红, 留给真正的主操作)
        default: 'bg-text-1 text-surface hover:bg-text-1/90 shadow-e1',
        outline: 'border border-border-strong bg-surface text-text-2 hover:bg-surface-sunken hover:text-text-1',
        subtle: 'bg-surface-sunken text-text-2 hover:bg-border hover:text-text-1',
        ghost: 'text-text-2 hover:bg-surface-sunken hover:text-text-1',
        danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-e1',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 text-base',
        sm: 'h-8 px-3 text-sm',
        lg: 'h-10 px-6 text-md',
        icon: 'h-9 w-9',
        'icon-sm': 'h-7 w-7',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = 'Button';

export { buttonVariants };
