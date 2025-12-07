import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'alert' | 'neutral';
  fullWidth?: boolean;
}

const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  fullWidth = false, 
  className = '', 
  disabled,
  ...props 
}) => {
  const baseStyle = "font-mono font-bold py-4 px-6 rounded-lg uppercase tracking-wider transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 relative overflow-hidden";
  
  const variants = {
    primary: "bg-lumen-primary/10 border-2 border-lumen-primary text-lumen-primary hover:bg-lumen-primary/20 shadow-[0_0_15px_rgba(0,255,148,0.3)]",
    secondary: "bg-lumen-secondary/10 border-2 border-lumen-secondary text-lumen-secondary hover:bg-lumen-secondary/20 shadow-[0_0_15px_rgba(0,224,255,0.3)]",
    tertiary: "bg-lumen-tertiary/10 border-2 border-lumen-tertiary text-lumen-tertiary hover:bg-lumen-tertiary/20 shadow-[0_0_15px_rgba(191,0,255,0.3)]",
    alert: "bg-lumen-alert/10 border-2 border-lumen-alert text-lumen-alert hover:bg-lumen-alert/20 animate-pulse",
    neutral: "bg-lumen-surface border-2 border-gray-600 text-gray-300 hover:border-gray-400"
  };

  return (
    <button 
      className={`${baseStyle} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;