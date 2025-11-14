import type { ReactNode, FC } from 'react'
import type { Persistor } from 'redux-persist'

declare module 'redux-persist/integration/react' {
  export interface PersistGateProps {
    children?: ReactNode
    loading?: ReactNode | null
    persistor: Persistor
  }

  export const PersistGate: FC<PersistGateProps>
}
