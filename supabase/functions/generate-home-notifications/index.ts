import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

// v29 scheduler entry point. It is intentionally conservative: it creates
// notification rows only from data that exists in ledger_user_data and does
// not mutate the Life Management state. Add this function to a scheduled
// invocation after reviewing the state schema in your project.
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
Deno.serve(async (_req) => {
  const { data: rows, error } = await admin.from('ledger_user_data').select('user_id,data')
  if (error) return new Response(JSON.stringify({ok:false,error:error.message}), {status:500})
  const today = new Date().toISOString().slice(0,10)
  let created = 0
  for (const row of rows || []) {
    const state = row.data?.state || row.data || {}
    const events = state?.calendar?.events || []
    for (const e of events) {
      if (e?.date !== today || (e.category === 'Task' && e.done)) continue
      const type = String(e.category||'Event').toLowerCase()
      const key = `calendar:${e.id}:${today}`
      const { data: existing } = await admin.from('notifications').select('id').eq('user_id',row.user_id).eq('type',type).contains('data',{dedupe_key:key}).limit(1)
      if (existing?.length) continue
      await admin.from('notifications').insert({user_id:row.user_id,type,title:`${e.category||'Event'} today`,body:`${e.time?e.time+' · ':''}${e.title||''}`.slice(0,180),data:{dedupe_key:key,source:'calendar',item_id:e.id}})
      created++
    }
  }
  return new Response(JSON.stringify({ok:true,created}), {headers:{'Content-Type':'application/json'}})
})
