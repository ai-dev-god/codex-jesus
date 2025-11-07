import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import { useAppDispatch, useAppSelector } from './store/hooks'
import { decrement, increment, reset } from './store/slices/counterSlice'

function App() {
  const count = useAppSelector((state) => state.counter.value)
  const dispatch = useAppDispatch()

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => dispatch(decrement())}>-1</button>
          <span>count is {count}</span>
          <button onClick={() => dispatch(increment())}>+1</button>
        </div>
        <button onClick={() => dispatch(reset())}>Reset persisted state</button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR. Counter value is
          now managed with Redux Toolkit and persisted across reloads.
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  )
}

export default App
