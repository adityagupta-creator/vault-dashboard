import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type NotifyPayload = {
  recipient?: string
  count?: number
  fileName?: string
  source?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase env vars are missing.')
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: req.headers.get('Authorization') ?? '' },
      },
    })

    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = (await req.json()) as NotifyPayload
    const configuredRecipient = Deno.env.get('ORDER_NOTIFY_RECIPIENT') ?? ''
    const recipient = configuredRecipient || body.recipient
    const count = Number(body.count ?? 0)
    const fileName = body.fileName ?? 'uploaded sheet'
    const source = body.source ?? 'sheet'

    if (!recipient) {
      return new Response(JSON.stringify({ error: 'Recipient email is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!Number.isFinite(count) || count <= 0) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY is not configured.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const from = Deno.env.get('ORDER_NOTIFY_FROM') ?? 'SafeGold Orders <onboarding@resend.dev>'
    const subject = `New client orders imported (${count})`
    const text = [
      `New client orders were imported from a ${source}.`,
      `Count: ${count}`,
      `File: ${fileName}`,
    ].join('\n')

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2 style="margin: 0 0 12px;">New client orders imported</h2>
        <p style="margin: 0 0 8px;">Source: ${source}</p>
        <p style="margin: 0 0 8px;">Count: <strong>${count}</strong></p>
        <p style="margin: 0;">File: ${fileName}</p>
      </div>
    `

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'safegold-vault-dashboard/1.0',
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject,
        text,
        html,
      }),
    })

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text()
      throw new Error(`Resend API error: ${errorText}`)
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
