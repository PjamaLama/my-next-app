# Google Tag Manager & Google Ads Conversion Tracking Setup Guide

## ✅ What's Been Implemented

Your app now has **Google Tag Manager (GTM)** installed with **Google Ads conversion tracking** for all key user milestones:

### 📊 Conversion Events Tracked

1. **Account Creation** (`account_created`) - When users sign up
2. **First Sheet Connection** (`first_sheet_connected`) - When users connect their first Google Sheet
3. **First Message Sent** (`first_message_sent`) - When users send their first chat message
4. **Pro Upgrade** (`pro_upgrade`) - When users upgrade to Pro ($19.97)

### 🔧 Technical Implementation

- ✅ GTM script installed in `layout.tsx`
- ✅ Google Analytics module created (`lib/analytics/googleAnalytics.ts`)
- ✅ Conversion tracking added to authentication flow
- ✅ Conversion tracking added to sheet connection flow
- ✅ Conversion tracking added to chat/messaging flow
- ✅ Conversion tracking added to Pro upgrade flow

---

## 🚀 Step-by-Step Setup Instructions

### Step 1: Create Google Tag Manager Container

1. Go to [Google Tag Manager](https://tagmanager.google.com/)
2. Click "Create Account"
3. Fill in:
   - **Account Name**: "SheetyAI"
   - **Container Name**: "SheetyAI Web"
   - **Target Platform**: Web
4. Click "Create"

### Step 2: Get Your GTM Container ID

1. In GTM, you'll see your Container ID (format: `GTM-XXXXXXX`)
2. Copy this ID

### Step 3: Set Environment Variables

Add these to your `.env.local` file:

```bash
# Google Tag Manager
NEXT_PUBLIC_GTM_ID=GTM-XXXXXXX

# Google Analytics 4 (optional but recommended)
NEXT_PUBLIC_GA4_MEASUREMENT_ID=G-XXXXXXXXXX

# Enable Google Analytics
NEXT_PUBLIC_GA_ENABLED=true

# Debug mode (set to false in production)
NEXT_PUBLIC_GA_DEBUG=false
```

**Replace `GTM-XXXXXXX` with your actual GTM Container ID**

### Step 4: Set Up Google Analytics 4 (GA4)

1. Go to [Google Analytics](https://analytics.google.com/)
2. Click "Create Property"
3. Choose "Web" platform
4. Enter your website details
5. Copy the **Measurement ID** (format: `G-XXXXXXXXXX`)
6. Add it to your `.env.local` as `NEXT_PUBLIC_GA4_MEASUREMENT_ID`

### Step 5: Configure GTM Container

#### 5.1 Set Up GA4 Configuration Tag

1. In GTM, click "Add a new tag"
2. Choose tag type: **Google Analytics: GA4 Configuration**
3. Enter your **Measurement ID** (`G-XXXXXXXXXX`)
4. Set trigger: **All Pages**
5. Name the tag: "GA4 - Configuration"
6. Save

#### 5.2 Set Up Conversion Triggers

Create these triggers to capture your conversion events:

1. **Account Created Trigger**:
   - Trigger Type: **Custom Event**
   - Event Name: `business_conversion`
   - Parameter: `conversion_type` equals `account_created`
   - Name: "Account Created Conversion"

2. **First Sheet Connected Trigger**:
   - Trigger Type: **Custom Event**
   - Event Name: `business_conversion`
   - Parameter: `conversion_type` equals `first_sheet_connected`
   - Name: "First Sheet Connected Conversion"

3. **First Message Sent Trigger**:
   - Trigger Type: **Custom Event**
   - Event Name: `business_conversion`
   - Parameter: `conversion_type` equals `first_message_sent`
   - Name: "First Message Sent Conversion"

4. **Pro Upgrade Trigger**:
   - Trigger Type: **Custom Event**
   - Event Name: `business_conversion`
   - Parameter: `conversion_type` equals `pro_upgrade`
   - Name: "Pro Upgrade Conversion"

#### 5.3 Set Up Conversion Tags

Create Google Ads Conversion tags for each trigger:

1. Click "Add a new tag"
2. Choose tag type: **Google Ads Conversion Tracking**
3. Select your Google Ads account
4. Choose the appropriate conversion action
5. Set the trigger to match the corresponding trigger above
6. Save

### Step 6: Create Google Ads Conversion Actions

1. Go to your [Google Ads account](https://ads.google.com/)
2. Click on the wrench icon (Tools & Settings)
3. Under "Measurement", click **Conversion**
4. Click the **+** button to create new conversions:

#### Create These Conversion Actions:

1. **Account Created**
   - Name: "Account Created"
   - Category: "Sign-up"
   - Value: "$0.00" (or estimated value)
   - Attribution: "Last click" or "Data-driven"

2. **First Sheet Connected**
   - Name: "First Sheet Connected"
   - Category: "Lead"
   - Value: "$0.00" (or estimated value)
   - Attribution: "Last click" or "Data-driven"

3. **First Message Sent**
   - Name: "First Message Sent"
   - Category: "Engaged users"
   - Value: "$0.00" (or estimated value)
   - Attribution: "Last click" or "Data-driven"

4. **Pro Upgrade** ⭐ (Most Important)
   - Name: "Pro Upgrade"
   - Category: "Purchase"
   - Value: "$19.97" (actual price)
   - Attribution: "Last click" or "Data-driven"

### Step 7: Link GTM to Google Ads

1. In GTM, go to **Admin** > **Container Settings**
2. Under "Google Ads Conversion Tracking", click **Link Google Ads**
3. Select your Google Ads account
4. Choose the conversion actions you created
5. Save

### Step 8: Test and Publish

#### 8.1 Test in Preview Mode

1. In GTM, click **Preview** button
2. Open your website in a new tab
3. Perform the actions (sign up, connect sheet, send message, upgrade)
4. Check GTM debugger to see if events fire correctly

#### 8.2 Publish the Container

1. In GTM, click **Submit** button
2. Add version name: "Initial Google Ads Setup"
3. Add description of changes
4. Click **Publish**

---

## 📈 Conversion Value Strategy

### Recommended Values to Set:

1. **Account Created**: $0.00 (awareness metric)
2. **First Sheet Connected**: $0.00 (engagement metric)
3. **First Message Sent**: $0.00 (engagement metric)
4. **Pro Upgrade**: $19.97 (actual revenue)

### Why This Structure Works:

- **Account Created** = Top of funnel awareness
- **First Sheet Connected** = User engagement milestone
- **First Message Sent** = Product usage milestone
- **Pro Upgrade** = Revenue conversion (highest priority)

---

## 🔍 Testing Your Setup

### Test Each Conversion:

1. **Clear cookies/cache** or use incognito mode
2. **Sign up** for a new account → Check GTM debugger for `account_created`
3. **Connect your first sheet** → Check for `first_sheet_connected`
4. **Send your first message** → Check for `first_message_sent`
5. **Upgrade to Pro** → Check for `pro_upgrade`

### Verify in Google Ads:

1. Go to **Tools & Settings** > **Conversion**
2. Look for attribution data within 24-48 hours

---

## 🐛 Troubleshooting

### Common Issues:

1. **Events not firing**: Check GTM debug console
2. **GA4 not tracking**: Verify Measurement ID
3. **Ads conversions not appearing**: Check Google Ads linking
4. **Wrong attribution**: Adjust attribution model in Google Ads

### Debug Mode:

Set `NEXT_PUBLIC_GA_DEBUG=true` in your `.env.local` to see detailed logging in browser console.

---

## 📊 Expected Results

After 24-48 hours, you should see:

- **Google Analytics**: User behavior and conversion funnels
- **Google Ads**: Conversion tracking and attribution
- **Campaign Optimization**: Better targeting based on user journey

---

## 🎯 Next Steps

1. **Set up Google Ads campaigns** targeting your audience
2. **Create conversion-focused landing pages**
3. **Monitor conversion rates** and optimize campaigns
4. **A/B test** different messaging based on conversion data

---

## 💡 Pro Tips

1. **Use UTM parameters** on external links to track traffic sources
2. **Set up Google Ads remarketing** lists based on conversions
3. **Create custom audiences** in Google Ads based on user behavior
4. **Monitor conversion lag** (time between click and conversion)
5. **Set up conversion value rules** for dynamic bidding

Your Google Ads conversion tracking is now fully set up and ready to optimize your campaigns! 🚀
