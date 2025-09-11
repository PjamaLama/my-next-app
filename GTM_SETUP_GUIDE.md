# Google Tag Manager Setup Guide for SheetyAI

**Migration from Direct gtag.js to GTM Container**

## 🚀 Migration Summary

Your SheetyAI app has been successfully migrated from direct gtag.js implementation to Google Tag Manager (GTM). This resolves the conflict between direct Google Ads/GA4 tracking and GTM-based conversion actions.

### What's Changed
- ✅ **Removed**: Direct gtag.js scripts from `app/layout.tsx`
- ✅ **Added**: GTM container script with environment variable support
- ✅ **Updated**: All event triggers to use `dataLayer.push()` instead of direct gtag calls
- ✅ **Maintained**: Meta Pixel and TikTok Pixel as direct implementations

---

## 📋 Prerequisites

### 1. Create Google Tag Manager Container

If you don't have a GTM container yet:

1. Go to [Google Tag Manager](https://tagmanager.google.com/)
2. Click **"Create Account"**
3. Fill in:
   - **Account Name**: "SheetyAI"
   - **Container Name**: "SheetyAI Web"
   - **Target Platform**: Web
4. Click **"Create"**
5. Copy your **Container ID** (format: `GTM-XXXXXXX`)

### 2. Set Environment Variable

Add to your `.env.local` file:

```bash
# Google Tag Manager
NEXT_PUBLIC_GTM_ID=GTM-XXXXXXX  # Replace with your actual GTM ID
```

---

## 🔧 GTM Container Configuration

### Step 1: Add Google Analytics 4 (GA4) Configuration Tag

1. In GTM, go to **Tags** → **New**
2. Choose tag type: **Google Analytics: GA4 Configuration**
3. Enter your **Measurement ID**: `G-4PSKB5BJY1`
4. Set **Trigger**: **All Pages**
5. Name the tag: `"GA4 - Configuration"`
6. Click **Save**

### Step 2: Add Google Ads Conversion Tracking Tag

1. Go to **Tags** → **New**
2. Choose tag type: **Google Ads Conversion Tracking**
3. Select your Google Ads account
4. Choose **Conversion**: `"Pro Upgrade"` (value: $19.97)
5. Set **Trigger**: We'll create this next
6. Name the tag: `"Google Ads - Pro Upgrade"`
7. Click **Save**

### Step 3: Create Conversion Triggers

Create these custom event triggers to capture your dataLayer events:

#### 3.1 Sign Up Trigger (Account Created)
1. Go to **Triggers** → **New**
2. Choose trigger type: **Custom Event**
3. Event name: `sign_up`
4. Set trigger to fire on: **All Custom Events**
5. Name: `"Sign Up Conversion"`
6. Click **Save**

#### 3.2 First Message Trigger
1. Go to **Triggers** → **New**
2. Choose trigger type: **Custom Event**
3. Event name: `first_message`
4. Set trigger to fire on: **All Custom Events**
5. Name: `"First Message Conversion"`
6. Click **Save**

#### 3.3 Purchase Trigger (Pro Upgrade)
1. Go to **Triggers** → **New**
2. Choose trigger type: **Custom Event**
3. Event name: `purchase`
4. Set trigger to fire on: **All Custom Events**
5. Name: `"Purchase Conversion"`
6. Click **Save**

### Step 4: Link Google Ads Conversion Tags to Triggers

1. Edit your Google Ads Conversion tag
2. In the **Triggering** section, select the appropriate trigger:
   - For Pro Upgrade: Select `"Purchase Conversion"`
3. Click **Save**

### Step 5: Add GA4 Event Tags

Create GA4 event tags for better tracking:

#### 5.1 Sign Up Event Tag
1. **Tags** → **New**
2. Tag type: **Google Analytics: GA4 Event**
3. Configuration Tag: Select your GA4 Configuration tag
4. Event Name: `sign_up`
5. Event Parameters: Add `method: google` (optional)
6. Trigger: `"Sign Up Conversion"`
7. Name: `"GA4 - Sign Up Event"`
8. **Save**

#### 5.2 First Message Event Tag
1. **Tags** → **New**
2. Tag type: **Google Analytics: GA4 Event**
3. Configuration Tag: Select your GA4 Configuration tag
4. Event Name: `first_interaction`
5. Event Parameters: Add `interaction_type: message`
6. Trigger: `"First Message Conversion"`
7. Name: `"GA4 - First Message Event"`
8. **Save**

#### 5.3 Purchase Event Tag
1. **Tags** → **New**
2. Tag type: **Google Analytics: GA4 Event**
3. Configuration Tag: Select your GA4 Configuration tag
4. Event Name: `purchase`
5. Event Parameters:
   - `currency: USD`
   - `value: 19.97`
   - `transaction_id: {{Click ID}}` (or use a custom variable)
6. Trigger: `"Purchase Conversion"`
7. Name: `"GA4 - Purchase Event"`
8. **Save**

---

## 🧪 Testing Your GTM Setup

### Method 1: GTM Debug Mode

1. In GTM, click the **"Preview"** button
2. Open your website in a new tab
3. Perform test actions:
   - Sign up for a new account → Check for `sign_up` event
   - Send your first message → Check for `first_message` event
   - Complete a Pro upgrade → Check for `purchase` event
4. In GTM debugger, verify events are firing correctly

### Method 2: DataLayer Inspection

Open browser console and check dataLayer:

```javascript
// Check dataLayer contents
console.log(window.dataLayer);

// Manually trigger test events
window.dataLayer.push({
  event: 'sign_up',
  value: 0,
  currency: 'USD'
});
```

### Method 3: Real-Time GA4 Reports

1. Go to [Google Analytics](https://analytics.google.com/)
2. Navigate to **Reports** → **Realtime**
3. Perform actions on your site and watch for events

### Method 4: Google Ads Conversion Tracking

1. Go to [Google Ads](https://ads.google.com/)
2. Navigate to **Tools & Settings** → **Conversion**
3. Look for attribution data (may take 24-48 hours)

---

## 📊 Event Mapping Reference

### DataLayer Events Your App Sends

| App Event | dataLayer Event | Parameters |
|-----------|----------------|------------|
| Account Created | `sign_up` | `{value: 0, currency: 'USD'}` |
| First Message | `first_message` | `{value: 0, currency: 'USD'}` |
| Pro Upgrade | `purchase` | `{value: 19.97, currency: 'USD', transaction_id: '...'}` |

### GTM Trigger Configuration

| Trigger Name | Event Name | Fires On |
|-------------|------------|----------|
| Sign Up Conversion | `sign_up` | All Custom Events |
| First Message Conversion | `first_message` | All Custom Events |
| Purchase Conversion | `purchase` | All Custom Events |

### Tag Configuration

| Tag Name | Type | Trigger | Purpose |
|----------|------|---------|---------|
| GA4 - Configuration | GA4 Config | All Pages | Base GA4 setup |
| Google Ads - Pro Upgrade | Ads Conversion | Purchase Conversion | Revenue tracking |
| GA4 - Sign Up Event | GA4 Event | Sign Up Conversion | User acquisition |
| GA4 - First Message Event | GA4 Event | First Message Conversion | Engagement tracking |
| GA4 - Purchase Event | GA4 Event | Purchase Conversion | Revenue tracking |

---

## 🚨 Troubleshooting Common Issues

### Issue: Events not firing in GTM
**Solution:**
1. Check GTM Preview mode is active
2. Verify event names match exactly (case-sensitive)
3. Ensure dataLayer is initialized: `window.dataLayer = window.dataLayer || []`
4. Check for JavaScript errors in console

### Issue: Google Ads conversions not attributing
**Solution:**
1. Verify Conversion Action is linked in Google Ads
2. Check Attribution Model settings (Last Click recommended)
3. Ensure Click ID (`gclid`) is being captured
4. Wait 24-48 hours for data to appear

### Issue: GA4 events not appearing
**Solution:**
1. Verify GA4 Configuration tag is firing on all pages
2. Check Measurement ID is correct
3. Ensure event parameters are properly formatted
4. Check Realtime reports for immediate feedback

### Issue: dataLayer.push not working
**Solution:**
1. Ensure GTM script loads before dataLayer.push calls
2. Check for typos in event names
3. Verify window.dataLayer is initialized
4. Test with manual dataLayer.push in console

---

## 📈 Enhanced GTM Features (Optional)

### Custom Variables

Create variables to capture dynamic data:

1. **Data Layer Variable** for `transaction_id`
   - Variable Type: Data Layer Variable
   - Data Layer Variable Name: `transaction_id`
   - Name: `DL - Transaction ID`

2. **Data Layer Variable** for `value`
   - Variable Type: Data Layer Variable
   - Data Layer Variable Name: `value`
   - Name: `DL - Purchase Value`

### Enhanced E-commerce Tracking

For more detailed purchase tracking:

1. Create a tag for **Enhanced E-commerce Purchase**
2. Add items array to dataLayer push:
```javascript
window.dataLayer.push({
  event: 'purchase',
  ecommerce: {
    purchase: {
      actionField: {
        id: transactionId,
        revenue: 19.97,
        tax: 0,
        shipping: 0
      },
      products: [{
        name: 'SheetyAI Pro Monthly',
        id: 'sheetyai_pro_monthly',
        price: 19.97,
        quantity: 1
      }]
    }
  }
});
```

---

## 🔄 Rollback Plan

If you need to rollback to direct gtag.js:

### Emergency Rollback Steps

1. **Restore direct scripts** in `app/layout.tsx`:
```javascript
{/* Google Ads tracking */}
<Script src="https://www.googletagmanager.com/gtag/js?id=AW-17507562116" />
<Script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'AW-17507562116');
</Script>

{/* Google Analytics */}
<Script src="https://www.googletagmanager.com/gtag/js?id=G-4PSKB5BJY1" />
<Script>
  window.dataLayer = window.dataLayer || [];
  gtag('js', new Date());
  gtag('config', 'G-4PSKB5BJY1');
</Script>
```

2. **Remove GTM scripts** from `app/layout.tsx`

3. **Restore direct gtag calls** in tracking functions:
```javascript
// In paypal-success/page.tsx
if (window.gtag) {
  window.gtag('event', 'conversion', {
    'send_to': 'AW-17507562116/fDpoCP3expMbEITloJxB',
    'value': 19.97,
    'currency': 'USD',
    'transaction_id': Date.now().toString()
  });
}
```

4. **Test all conversions** work with direct implementation

---

## 📋 Checklist for Go-Live

- [ ] GTM container created and configured
- [ ] NEXT_PUBLIC_GTM_ID environment variable set
- [ ] All conversion triggers created in GTM
- [ ] Google Ads Conversion tags linked to triggers
- [ ] GA4 event tags configured
- [ ] GTM container published
- [ ] Test events firing in GTM Preview mode
- [ ] Verify conversions in Google Ads (24-48 hour delay)
- [ ] Test GA4 events in Realtime reports
- [ ] Backup rollback plan documented

---

## 🎯 Expected Results

After successful GTM migration:

### Google Ads
- ✅ Conversion actions properly attributed
- ✅ No more conflicts between direct and GTM tracking
- ✅ Accurate conversion data within 24-48 hours
- ✅ Better attribution modeling options

### Google Analytics 4
- ✅ All events captured with proper parameters
- ✅ Enhanced ecommerce tracking capabilities
- ✅ Real-time event monitoring
- ✅ Better user journey analysis

### Overall Benefits
- ✅ Centralized tracking management
- ✅ Easier debugging and maintenance
- ✅ Better version control of tracking setup
- ✅ Enhanced privacy and consent controls
- ✅ Improved campaign optimization

---

## 📞 Support Resources

### Google Tag Manager Help
- [GTM Help Center](https://support.google.com/tagmanager)
- [GTM Developer Guide](https://developers.google.com/tag-manager)
- [GTM Troubleshooting](https://support.google.com/tagmanager/answer/6107057)

### Google Ads Help
- [Conversion Tracking Setup](https://support.google.com/google-ads/answer/6095821)
- [GTM Integration](https://support.google.com/google-ads/answer/7549394)

### Google Analytics Help
- [GA4 Event Tracking](https://support.google.com/analytics/answer/9322688)
- [Enhanced Ecommerce](https://support.google.com/analytics/answer/6014841)

---

**Migration completed successfully! Your tracking system is now properly configured with GTM for optimal attribution and management.**
