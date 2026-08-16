/* Life Management — unified notifications */

(() => {

  const VAPID_PUBLIC_KEY =
    'BA0cxGOHpYIvMApOwhCdEcM16sAhjV7inrCNCNV9eDmc-v_HJfV7zp8J78CeGGGoztxFTauXOHf5DmOC47CBC9k';

  const PREF_KEY =
    'life_notification_preferences_v30';

  const defaults = {
    calendar: true,
    bills: true,
    water: true,
    sleep: true,
    workout: true,
    grocery: true,
    reading: true,
    journal: true,
    messages: true,
    vitals: false
  };

  let notificationChannel = null;

  /* ---------- PREFS ---------- */

  function getPrefs() {
    try {
      return {
        ...defaults,
        ...JSON.parse(
          localStorage.getItem(PREF_KEY) || '{}'
        )
      };
    } catch (e) {
      return { ...defaults };
    }
  }

  async function savePrefs(prefs) {

    localStorage.setItem(
      PREF_KEY,
      JSON.stringify(prefs)
    );

    if (
      typeof supabaseClient !== 'undefined' &&
      supabaseClient &&
      typeof supabaseUser !== 'undefined' &&
      supabaseUser
    ) {

      const { error } =
        await supabaseClient
          .from('notification_preferences')
          .upsert(
            {
              user_id: supabaseUser.id,
              preferences: prefs,
              updated_at: new Date().toISOString()
            },
            {
              onConflict: 'user_id'
            }
          );

      if (error) {
        console.warn(
          '[Notifications] preference save failed',
          error
        );
      }
    }
  }

  /* ---------- SUPPORT ---------- */

  function supported() {
    return (
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window
    );
  }

  async function ensureSW() {

    const reg =
      await navigator.serviceWorker.register(
        './sw.js',
        {
          scope: './'
        }
      );

    await navigator.serviceWorker.ready;

    return reg;
  }

  function base64ToUint8Array(base64String) {

    const padding =
      '='.repeat(
        (4 - base64String.length % 4) % 4
      );

    const base64 =
      (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const raw =
      atob(base64);

    return Uint8Array.from(
      [...raw].map(char =>
        char.charCodeAt(0)
      )
    );
  }

  /* ---------- ENABLE PUSH ---------- */

  async function enablePush() {

    if (!supported()) {
      throw new Error(
        'Web Push is not supported on this device/browser.'
      );
    }

    if (
      typeof supabaseClient === 'undefined' ||
      !supabaseClient ||
      typeof supabaseUser === 'undefined' ||
      !supabaseUser
    ) {
      throw new Error(
        'Please log in first.'
      );
    }

    let permission =
      Notification.permission;

    if (permission !== 'granted') {
      permission =
        await Notification.requestPermission();
    }

    if (permission !== 'granted') {
      throw new Error(
        'Notification permission was not granted.'
      );
    }

    const registration =
      await ensureSW();

    // Always renew the browser subscription when the user explicitly enables
    // phone push. This prevents a stale subscription created with an older
    // VAPID key from being reused after a key rotation.
    let subscription =
      await registration.pushManager
        .getSubscription();

    if (subscription) {
      const oldEndpoint = subscription.endpoint;
      try {
        await subscription.unsubscribe();
      } catch (e) {
        console.warn('[Notifications] old subscription unsubscribe failed', e);
      }
      if (supabaseClient && supabaseUser) {
        await supabaseClient
          .from('notification_devices')
          .delete()
          .eq('user_id', supabaseUser.id)
          .eq('endpoint', oldEndpoint);
      }
      subscription = null;
    }

    subscription =
      await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey:
          base64ToUint8Array(
            VAPID_PUBLIC_KEY
          )
      });

    const json =
      subscription.toJSON();

    const row = {
      user_id: supabaseUser.id,
      endpoint: json.endpoint,
      subscription: json,
      user_agent: navigator.userAgent,
      updated_at: new Date().toISOString()
    };

    const { error } =
      await supabaseClient
        .from('notification_devices')
        .upsert(
          row,
          {
            onConflict: 'endpoint'
          }
        );

    if (error) {
      throw error;
    }

    await savePrefs(getPrefs());

    console.log(
      '[Notifications] PUSH ENABLED',
      {
        endpoint: json.endpoint
      }
    );

    return true;
  }

  /* ---------- DISABLE PUSH ---------- */

  async function disablePush() {

    try {

      const registration =
        await ensureSW();

      const subscription =
        await registration.pushManager
          .getSubscription();

      if (!subscription) {
        return;
      }

      const endpoint =
        subscription.endpoint;

      await subscription.unsubscribe();

      if (
        typeof supabaseClient !== 'undefined' &&
        supabaseClient &&
        typeof supabaseUser !== 'undefined' &&
        supabaseUser
      ) {

        await supabaseClient
          .from('notification_devices')
          .delete()
          .eq(
            'user_id',
            supabaseUser.id
          )
          .eq(
            'endpoint',
            endpoint
          );
      }

    } catch (error) {

      console.warn(
        '[Notifications] disable failed',
        error
      );
    }
  }

  /* ---------- LOCAL DISPLAY ---------- */

  async function showLocalNotification(
    title,
    body,
    tag
  ) {

    if (
      !('Notification' in window) ||
      Notification.permission !== 'granted'
    ) {
      return;
    }

    const registration =
      await ensureSW();

    await registration.showNotification(
      title,
      {
        body,
        tag,
        icon:
          './assets/icons/icon-192.png',
        badge:
          './assets/icons/icon-192.png',
        data: {
          url: './'
        }
      }
    );
  }

  /* ---------- NOTIFICATION CENTER ---------- */

  async function getNotifications() {

    if (
      typeof supabaseClient === 'undefined' ||
      !supabaseClient ||
      typeof supabaseUser === 'undefined' ||
      !supabaseUser
    ) {
      return [];
    }

    const { data, error } =
      await supabaseClient
        .from('notifications')
        .select(
          'id,type,title,body,data,created_at,delivered_at,read_at'
        )
        .eq(
          'user_id',
          supabaseUser.id
        )
        .order(
          'created_at',
          {
            ascending: false
          }
        )
        .limit(50);

    if (error) {
      console.warn(
        '[Notifications] load failed',
        error
      );

      return [];
    }

    return data || [];
  }

  async function markNotificationRead(id) {

    if (!id) return;

    await supabaseClient
      .from('notifications')
      .update({
        read_at:
          new Date().toISOString()
      })
      .eq('id', id)
      .eq(
        'user_id',
        supabaseUser.id
      );
  }

  async function markAllNotificationsRead() {

    if (
      typeof supabaseClient === 'undefined' ||
      !supabaseClient ||
      !supabaseUser
    ) {
      return;
    }

    await supabaseClient
      .from('notifications')
      .update({
        read_at:
          new Date().toISOString()
      })
      .eq(
        'user_id',
        supabaseUser.id
      )
      .is(
        'read_at',
        null
      );
  }

  function notificationIcon(type) {

    const icons = {
      message: '💬',
      calendar: '📅',
      bill: '💰',
      water: '💧',
      sleep: '🌙',
      workout: '🏋️',
      grocery: '🛒',
      reading: '📖',
      journal: '📝'
    };

    return icons[type] || '🔔';
  }

  async function openNotificationCenter() {

    const items =
      await getNotifications();

    const unread =
      items.filter(
        item => !item.read_at
      ).length;

    const rows =
      items.length
        ? items.map(item => {

            const time =
              new Date(
                item.created_at
              ).toLocaleString();

            return `
              <button
                type="button"
                class="lm-notification-item ${item.read_at ? '' : 'unread'}"
                data-notification-id="${item.id}"
              >
                <span class="lm-notification-icon">
                  ${notificationIcon(item.type)}
                </span>

                <span class="lm-notification-content">
                  <strong>
                    ${escapeHtml(item.title || 'Notification')}
                  </strong>

                  <span>
                    ${escapeHtml(item.body || '')}
                  </span>

                  <small>
                    ${escapeHtml(time)}
                  </small>
                </span>
              </button>
            `;

          }).join('')
        : `
          <div class="empty">
            No notifications yet.
          </div>
        `;

    const body = `
      <div class="form-col">

        <div class="card-head-row">
          <div class="text-faint">
            ${unread}
            unread
          </div>

          ${
            unread
              ? `
                <button
                  type="button"
                  class="btn btn-ghost"
                  id="lmMarkAllRead"
                >
                  Mark all as read
                </button>
              `
              : ''
          }
        </div>

        <div class="lm-notification-list">
          ${rows}
        </div>

        <button
          type="button"
          class="btn btn-primary"
          onclick="closeModal()"
        >
          Done
        </button>

      </div>
    `;

    openModal(
      'Notifications',
      body
    );

    document
      .querySelectorAll(
        '.lm-notification-item'
      )
      .forEach(button => {

        button.addEventListener(
          'click',
          async () => {

            const id =
              button.dataset.notificationId;

            await markNotificationRead(id);

            button.classList.remove(
              'unread'
            );
          }
        );
      });

    document
      .getElementById(
        'lmMarkAllRead'
      )
      ?.addEventListener(
        'click',
        async () => {

          await markAllNotificationsRead();

          document
            .querySelectorAll(
              '.lm-notification-item'
            )
            .forEach(el =>
              el.classList.remove(
                'unread'
              )
            );
        }
      );
  }

  /* ---------- BELL ---------- */

  async function updateBell() {

    const bell =
      document.getElementById(
        'lmNotificationBell'
      );

    if (!bell) return;

    const items =
      await getNotifications();

    const unread =
      items.filter(
        item => !item.read_at
      ).length;

    bell.innerHTML = `
      <span class="lm-bell-icon">🔔</span>
      ${
        unread
          ? `<span class="lm-bell-count">${unread > 99 ? '99+' : unread}</span>`
          : ''
      }
    `;
  }

  function installBell() {

    if (
      document.getElementById(
        'lmNotificationBell'
      )
    ) {
      return;
    }

    const topbar =
      document.querySelector(
        '.topbar'
      );

    if (!topbar) {
      return;
    }

    const button =
      document.createElement(
        'button'
      );

    button.id =
      'lmNotificationBell';

    button.type =
      'button';

    button.className =
      'lm-notification-bell';

    button.title =
      'Notifications';

    button.setAttribute(
      'aria-label',
      'Notifications'
    );

    button.addEventListener(
      'click',
      openNotificationCenter
    );

    const hamburger =
      topbar.querySelector(
        '.hamburger'
      );

    if (hamburger) {
      topbar.insertBefore(
        button,
        hamburger
      );
    } else {
      topbar.appendChild(
        button
      );
    }

    updateBell();
  }

  /* ---------- SETTINGS UI ---------- */

  function notificationSettingsHtml() {

    const prefs =
      getPrefs();

    const labels = [
      ['calendar', 'Calendar'],
      ['bills', 'Bills'],
      ['water', 'Water'],
      ['sleep', 'Sleep'],
      ['workout', 'Workout'],
      ['grocery', 'Grocery'],
      ['reading', 'Reading'],
      ['journal', 'Journal'],
      ['messages', 'Messages'],
      ['vitals', 'Vitals']
    ];

    return `
      <div class="mini-chart-title">
        Notifications
      </div>

      <div class="sync-note">
        Choose which areas are allowed to
        create notifications.
      </div>

      <div class="lm-notify-grid">

        ${labels.map(
          ([key, label]) => `
            <label class="lm-notify-row">

              <input
                type="checkbox"
                data-notify-key="${key}"
                ${prefs[key] ? 'checked' : ''}
                ${key === 'vitals' ? 'disabled' : ''}
              >

              <span>
                ${label}
              </span>

              ${
                key === 'vitals'
                  ? '<small>Excluded</small>'
                  : ''
              }

            </label>
          `
        ).join('')}

      </div>

      <div class="mini-chart-title">
        Phone Notifications
      </div>

      <div class="lm-phone-toggle-row">
        <div>
          <div class="lm-phone-toggle-title">Phone Notifications</div>
          <div id="lmNotifyStatus" class="sync-note lm-phone-toggle-status">
            Checking notification status…
          </div>
        </div>

        <label class="lm-switch" title="Turn phone notifications on or off">
          <input type="checkbox" id="lmEnablePush" aria-label="Phone Notifications">
          <span class="lm-switch-slider"></span>
        </label>
      </div>
    `;
  }

  function attachSettingsControls() {

    document
      .querySelectorAll(
        '[data-notify-key]'
      )
      .forEach(input => {

        input.addEventListener(
          'change',
          async event => {

            const prefs =
              getPrefs();

            prefs[
              event.target.dataset.notifyKey
            ] =
              event.target.checked;

            await savePrefs(prefs);
          }
        );
      });

    const pushToggle = document.getElementById('lmEnablePush');
    pushToggle?.addEventListener('change', async (event) => {
      const status = document.getElementById('lmNotifyStatus');
      const turningOn = event.target.checked;

      event.target.disabled = true;

      try {
        if (turningOn) {
          await enablePush();
          if (status) status.textContent = 'ON · Phone notifications are enabled.';
        } else {
          await disablePush();
          if (status) status.textContent = 'OFF · Phone notifications are disabled.';
        }
      } catch (error) {
        console.error('[Notifications]', error);
        event.target.checked = !turningOn;
        if (status) {
          status.textContent = error.message || 'Could not change notification setting.';
        }
      } finally {
        event.target.disabled = false;
      }
    });

    refreshPushToggleState();

  }

  async function refreshPushToggleState() {
    const toggle = document.getElementById('lmEnablePush');
    const status = document.getElementById('lmNotifyStatus');
    if (!toggle) return;

    try {
      const registration = await ensureSW();
      const subscription = await registration.pushManager.getSubscription();
      const on = !!subscription && Notification.permission === 'granted';
      toggle.checked = on;
      if (status) {
        status.textContent = on
          ? 'ON · Phone notifications are enabled.'
          : 'OFF · Phone notifications are disabled.';
      }
    } catch (error) {
      toggle.checked = false;
      if (status) status.textContent = 'OFF · Phone notifications are disabled.';
      console.warn('[Notifications] status check failed', error);
    }
  }

  /* ---------- REMOTE PREFS ---------- */

  async function syncRemotePrefs() {

    if (
      typeof supabaseClient === 'undefined' ||
      !supabaseClient ||
      typeof supabaseUser === 'undefined' ||
      !supabaseUser
    ) {
      return;
    }

    const { data } =
      await supabaseClient
        .from('notification_preferences')
        .select('preferences')
        .eq(
          'user_id',
          supabaseUser.id
        )
        .maybeSingle();

    if (data?.preferences) {

      localStorage.setItem(
        PREF_KEY,
        JSON.stringify({
          ...defaults,
          ...data.preferences
        })
      );
    }
  }

  /* ---------- REALTIME BELL REFRESH ---------- */

  function notificationPreferenceKey(record) {
    const type = String(record?.type || '').toLowerCase();
    const source = String(record?.data?.source || '').toLowerCase();
    if (type === 'message') return 'messages';
    if (source === 'calendar' || ['event','task','calendar'].includes(type)) return 'calendar';
    if (['bill','bills','payment','due'].includes(type)) return 'bills';
    if (['water','hydration'].includes(type)) return 'water';
    if (['sleep','oversleeping'].includes(type)) return 'sleep';
    if (['workout','training','exercise'].includes(type)) return 'workout';
    if (['grocery','groceries'].includes(type)) return 'grocery';
    if (['reading','book'].includes(type)) return 'reading';
    if (['journal','gratitude'].includes(type)) return 'journal';
    if (['vitals','vital'].includes(type)) return 'vitals';
    return null;
  }

  function subscribeNotificationUpdates() {
    if (
      notificationChannel ||
      typeof supabaseClient === 'undefined' ||
      !supabaseClient ||
      !supabaseUser
    ) return;

    const userId = supabaseUser.id;
    notificationChannel = supabaseClient
      .channel('life-notification-center-' + userId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: 'user_id=eq.' + userId
      }, async payload => {
        const record = payload?.new || {};
        console.log('[Notifications] new notification', record);
        const prefs = getPrefs();
        const key = notificationPreferenceKey(record);
        if (key && prefs[key] && Notification.permission === 'granted') {
          await showLocalNotification(
            record.title || 'Life Management',
            record.body || '',
            String(record.type || 'notification') + '-' + String(record.id || Date.now())
          );
        }
      })
      .subscribe(status => {
        console.log('[Notifications] realtime status', status);
      });
  }

  function destroyNotificationSubscription() {
    if (notificationChannel && typeof supabaseClient !== 'undefined' && supabaseClient) {
      try { supabaseClient.removeChannel(notificationChannel); } catch (e) { console.warn('[Notifications] channel cleanup', e); }
    }
    notificationChannel = null;
  }

  /* ---------- HTML ESCAPE ---------- */

  function escapeHtml(value) {

    return String(value ?? '')
      .replace(
        /[&<>"']/g,
        char => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        })[char]
      );
  }

  /* ---------- PUBLIC API ---------- */

  window.enableLifePush =
    enablePush;

  window.disableLifePush =
    disablePush;

  window.openLifeNotificationCenter =
    openNotificationCenter;

  window.getLifeNotificationPrefs =
    getPrefs;

  window.getLifeNotificationSettingsHtml =
    notificationSettingsHtml;

  window.attachLifeNotificationSettings =
    attachSettingsControls;

  window.updateLifeNotificationBell = updateBell;

  window.initLifeNotifications = async function() {
    if (typeof supabaseUser === 'undefined' || !supabaseUser) return;
    try {
      await syncRemotePrefs();
      subscribeNotificationUpdates();
    } catch (e) {
      console.warn('[Notifications] initialization failed', e);
    }
  };

  window.destroyLifeNotifications = function() {
    destroyNotificationSubscription();
  };

})();
