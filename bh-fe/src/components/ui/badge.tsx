import * as React from "react"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success"
}

function Badge({ className = "", variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "gradient-electric text-void shadow-md",
    secondary: "gradient-neural text-white shadow-md",
    success: "gradient-bio text-void shadow-md",
    destructive: "gradient-pulse text-white shadow-md",
    outline: "border-2 border-cloud bg-white text-ink",
  }

  return (
    <div
      className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${variants[variant]} ${className}`}
      {...props}
    />
  )
}

export { Badge }
