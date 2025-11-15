import * as React from "react"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={`flex h-11 w-full rounded-xl border-2 border-cloud bg-pearl px-4 py-3 text-sm font-medium text-ink placeholder:text-steel focus:border-electric focus:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric/20 disabled:cursor-not-allowed disabled:opacity-50 transition-all ${className}`}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
