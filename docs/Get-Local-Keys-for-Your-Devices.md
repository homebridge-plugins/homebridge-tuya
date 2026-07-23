# Get Local Keys for Your Devices

This guide walks you through retrieving your Tuya device local keys, which are required for Local mode communication.

---

## Quick Summary

- 🔑 **Local Key:** A 16-character AES encryption key for each device
- 📱 **Required for:** Local mode (LAN communication without cloud)
- ⏰ **Time to complete:** ~15 minutes
- 💰 **Cost:** Free (uses Tuya's free trial API)

---

## Prerequisites

Before you start, ensure:
- ✅ All devices are added to Tuya Smart app
- ✅ You have a Tuya/SmartLife app account
- ✅ Access to the [Tuya IoT Platform](https://iot.tuya.com)

---

## Step-by-Step Guide

### Step 1: Add Devices to Tuya Smart App

First, ensure all your smart devices are added to the Tuya Smart app.

**Download the app:**
- [iOS](https://apps.apple.com/app/tuya-smart/id1034649547)
- [Android](https://play.google.com/store/apps/details?id=com.tuya.smart)

**Add devices:**
1. Open the Tuya Smart app
2. Tap the **+** button to add a new device
3. Follow the app's instructions to connect each device
4. Note the device names for later reference

---

### Step 2: Create Tuya IoT Account

1. Go to [Tuya IoT Platform](https://iot.tuya.com)
2. Click **Sign Up** in the top right

![Sign Up Button](https://user-images.githubusercontent.com/82495132/120384295-d2c95100-c2da-11eb-930d-75eaad628f4f.png)

3. Fill in your information:
   - Email address
   - Password
   - Company name (can be anything)

![Sign Up Form](https://user-images.githubusercontent.com/82495132/120384453-099f6700-c2db-11eb-8cbc-20f3bc5bb17f.png)

4. Check "Agree to Terms"
5. Click **Agree**
6. You'll receive a verification code via email — enter it
7. Log in to your account

---

### Step 3: Create Cloud Project

1. Once logged in, click **Cloud** in the left sidebar
2. Click **Projects**
3. Under **TRIAL EDITION**, click **Free Trial**

![Free Trial Button](https://user-images.githubusercontent.com/82495132/120384723-60a53c00-c2db-11eb-8f79-f2a2f38dbc8a.png)

4. A new tab will open — click **Buy Now** (don't worry, it's free)

![Buy Now Button](https://user-images.githubusercontent.com/82495132/120384754-69960d80-c2db-11eb-802c-7067dff3274a.png)

5. Close any popup tabs for "Tuya Value Added Service"
6. Back in the original tab, click **Subscribed** to refresh
7. Go back to **Cloud** → **Projects** if needed
8. Click **Create**

---

### Step 4: Configure Project

When creating your project:

1. **Edition:** Select "**Smart Home PAAS**"
2. **Region:** Select your region (this is **important** — affects device access):
   - 🇺🇸 **US** = United States
   - 🇪🇺 **EU** = Europe
   - 🇨🇳 **CN** = China
   - 🇮🇳 **IN** = India
   - See [Data Center Mapping](https://developer.tuya.com/en/docs/iot/oem-app-data-center-distributed?id=Kafi0ku9l07qb) or [Countries Regions and Tuya Data Center](https://github.com/tuya/tuya-home-assistant/wiki/Countries-Regions-and-Tuya-Data-Center) for your region

3. Click **Create**

![Create Project](https://user-images.githubusercontent.com/82495132/120386067-04431c00-c2dd-11eb-93ff-27371397e1e2.png)

---

### Step 5: Subscribe to APIs

You need to subscribe to APIs to access device information.

1. From your project, go to **Service API**
2. Click **Go to Authorize** or **Authorization**
3. Subscribe to these services:
   - ✅ **Authorization Token Management** (required)
   - ✅ **IoT Core** (required)
   - ✅ **Device Status Notification** (optional but recommended)

4. Click **Authorize** for the recommended APIs

![Authorize APIs](https://user-images.githubusercontent.com/82495132/120384846-87637280-c2db-11eb-8a3c-b2fd256f68d5.png)

---

### Step 6: Link Your Tuya App Account

1. From your project, go to **Devices Panel** or **Link Devices**
2. Click **Link Tuya App Account** or **Add App Account**

![Add App Account](https://user-images.githubusercontent.com/82495132/120385095-d7dad000-c2db-11eb-9e4c-595af4502154.png)

3. Scan the QR code with your Tuya Smart app:
   - Open Tuya Smart app
   - Tap **Me** (bottom right)
   - Tap the **Scan** icon
   - Scan the QR code shown on the IoT Platform

![Scan QR Code](https://user-images.githubusercontent.com/82495132/120385375-2f793b80-c2dc-11eb-9343-c579fc288962.png)

4. Confirm the sign-in in your phone's Tuya app
5. Wait for confirmation on the web page

---

### Step 7: Find Device ID

1. Go to **Devices Panel** → **All Devices** (or **Link Devices** → **Linked Devices**)
2. You should see all your linked devices
3. Find your device in the list
4. Copy the **Device ID** (usually a long hex string like `bf1234567890abcd`)

![Device List](https://user-images.githubusercontent.com/484912/204113199-a7ffd1c6-7f22-4295-a3a1-948ba15643b2.png)

---

### Step 8: Retrieve Local Key

Now use the API to get your device's local key.

1. In the left sidebar, hover over **Cloud** and click **API Explorer**

![API Explorer](https://user-images.githubusercontent.com/484912/204113419-3d106164-eff8-4ff3-a4f5-c7f2a025de96.png)

2. In the search box, type `"get device information"` (note: search for the one WITHOUT "the")
   - It should be under **Device Management** or **General Devices management** section
   - **Do NOT** use "Get _the_ device information" — it won't work

3. Click on the correct endpoint
4. Paste your device ID into the **device_id** field
5. Click **Submit Request**

6. In the **Response** section, look for the `local_key` property
   - This is your 16-character local key

![Local Key in Response](https://user-images.githubusercontent.com/484912/204113337-81ebe3c3-5f3a-4854-a069-aa929bfb145d.png)

---

### Step 9: Repeat for Other Devices

Repeat Steps 7-8 for each device you want to use in Local mode.

**Create a spreadsheet** to keep track:

| Device Name | Device ID | Local Key | Protocol Version |
|-------------|-----------|-----------|-----------------|
| Living Room Light | `bf1234567890abcd` | `0123456789abcdef` | 3.4 |
| Kitchen Plug | `cd0987654321dcba` | `fedcba9876543210` | 3.3 |

---

## Using Your Local Keys

Once you have your local keys, add them to your Homebridge config in Local or Both mode:

```json
{
  "platform": "TuyaPlatform",
  "mode": "local",
  "local": {
    "autoDiscoverDevices": true,
    "devices": [
      {
        "tuyaDeviceId": "bf1234567890abcd",
        "tuyaKey": "0123456789abcdef",
        "name": "Living Room Light"
      }
    ]
  }
}
```

---

## Troubleshooting

### "Device not found in API Explorer"

**Solution:**
- Ensure device is linked in **Devices Panel** → **All Devices**
- Check that you selected the correct project and region
- Try refreshing the page and searching again

### "API Explorer returns empty response"

**Solution:**
- Verify you used the correct endpoint ("Get device information" NOT "Get _the_ device information")
- Ensure the device ID is copied correctly (no extra spaces)
- Check that the API is subscribed

### "Local key is invalid format"

**Solution:**
- Local keys should be exactly **16 characters**
- Don't confuse with device ID (which is longer)
- Copy the entire value from the `local_key` field in the API response

### "Can't find the device list in API"

**Solution:**
- Make sure you've linked your Tuya app account to the project
- Go back to **Devices Panel** and verify devices appear there first
- If no devices appear, you may need to check your project's region setting

---

## Video Tutorial

For a visual walkthrough, see: [YouTube Tutorial](https://youtu.be/FpY-xsY-pZ8)

---

## Next Steps

Once you have your local keys:
1. Add them to your [CONFIG_GUIDE.md](./CONFIG_GUIDE.md) in Local or Both mode
2. Restart Homebridge
3. Your devices should appear in HomeKit
