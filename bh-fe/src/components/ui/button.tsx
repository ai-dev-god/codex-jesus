import * as React from "react"
import { Slot } from "@radix-ui/react-slot"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    
    const baseStyles = "inline-flex items-center justify-center whitespace-nowrap rounded-xl font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
    
    const variants = {
      default: "gradient-electric text-void shadow-lg hover:scale-105",
      destructive: "gradient-pulse text-white shadow-lg hover:scale-105",
      outline: "border-2 border-cloud bg-white hover:bg-pearl text-ink",
      secondary: "gradient-neural text-white shadow-lg hover:scale-105",
      ghost: "hover:bg-pearl text-steel hover:text-ink",
      link: "text-electric underline-offset-4 hover:underline",
    }
    
    const sizes = {
      default: "h-11 px-6 py-3",
      sm: "h-9 rounded-lg px-4 text-sm",
      lg: "h-14 rounded-xl px-8 text-lg",
      icon: "h-11 w-11",
    }
    
    return (
      <Comp
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
