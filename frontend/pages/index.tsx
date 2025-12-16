
import { useState } from 'react'
import useSWR from 'swr'
import { getDaily, getFlags } from '../lib/api'

export default function Home() {
  const [date, setDate] = useState('')
  const { data: daily } = useSWR(['daily', date], () => getDaily(date))
  const { data: flags } = useSWR('flags', () => getFlags(10))
  return (
    <div style={{fontFamily:'system-ui', margin:'2rem'}}>
      <h1>Fuel Management Dashboard</h1>
      <div style={{margin:'1rem 0'}}>
        <label>Date:&nbsp;</label>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} />
      </div>
      <h2>Daily Summary</h2>
      <pre>{JSON.stringify(daily, null, 2)}</pre>
      <h2>Flags</h2>
      <pre>{JSON.stringify(flags, null, 2)}</pre>
    </div>
  )
}
