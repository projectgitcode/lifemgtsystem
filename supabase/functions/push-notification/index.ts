import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!
const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:notifications@lifemanagement.app'

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
const admin = createClient(supabaseUrl, serviceKey)

Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    const record = payload.record
    if (!record?.user_id) return new Response(JSON.stringify({ok:false, skipped:'no user'}), {status:200})

    const { data: pref } = await admin.from('notification_preferences').select('preferences').eq('user_id', record.user_id).maybeSingle()
    const prefs = pref?.preferences || {}
    const type = String(record.type || '').toLowerCase()
    const source = String(record.data?.source || '').toLowerCase()
    const prefKey = type === 'message' ? 'messages'
      : source === 'calendar' || ['event','task','calendar'].includes(type) ? 'calendar'
      : ['bill','bills','payment','due'].includes(type) ? 'bills'
      : ['water','hydration'].includes(type) ? 'water'
      : ['sleep','oversleeping'].includes(type) ? 'sleep'
      : ['workout','training','exercise'].includes(type) ? 'workout'
      : ['grocery','groceries'].includes(type) ? 'grocery'
      : ['reading','book'].includes(type) ? 'reading'
      : ['journal','gratitude'].includes(type) ? 'journal'
      : ['vitals','vital'].includes(type) ? 'vitals'
      : null
    if (prefKey && prefs[prefKey] === false) return new Response(JSON.stringify({ok:true, skipped:`${prefKey} disabled`}), {headers:{'Content-Type':'application/json'}})

    const { data: devices } = await admin.from('notification_devices').select('id,endpoint,subscription').eq('user_id', record.user_id)
    const results = []
    for (const device of devices || []) {
      try {
        await webpush.sendNotification(device.subscription, JSON.stringify({
          title: record.title || 'Life Management',
          body: record.body || '',
          tag: `${record.type}-${record.id}`,
          notificationId: record.id,
          url: './'
        }))
        results.push({id:device.id,ok:true})
      } catch (err) {
        const status = err?.statusCode ?? err?.status ?? null
        const headers = err?.headers ? Object.fromEntries(err.headers.entries ? err.headers.entries() : Object.entries(err.headers)) : undefined
        let body = err?.body || err?.message || String(err)
        try { if (typeof body !== 'string') body = JSON.stringify(body) } catch (_) {}
        console.error('PUSH DEVICE ERROR', JSON.stringify({device_id:device.id,status,body,headers}))
        // 404/410 means the subscription is gone. 401 commonly indicates a
        // stale/invalid VAPID subscription; remove it so the client can create
        // a fresh subscription on the next enable.
        if (status === 404 || status === 410 || status === 401) {
          await admin.from('notification_devices').delete().eq('id',device.id)
        }
        results.push({id:device.id,ok:false,status,error:body})
      }
    }
    await admin.from('notifications').update({delivered_at:new Date().toISOString()}).eq('id',record.id)
    return new Response(JSON.stringify({ok:true,results}), {headers:{'Content-Type':'application/json'}})
  } catch (e) {
    return new Response(JSON.stringify({ok:false,error:String(e?.message || e)}), {status:500,headers:{'Content-Type':'application/json'}})
  }
})
