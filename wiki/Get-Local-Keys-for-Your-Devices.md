# Get Local Keys for Your Devices

To get the local keys for your devices, you'll need an account on Tuya's IoT site. Don't be overwhelmed, there's a lot on that site but it's pretty easy to get what you need out of it. The free trial will give you enough access to the Tuya API to get the information you need, on up to 50 devices.

## 1 - Tuya Smart App

As a prerequisite, add all of your devices to the Tuya Smart app ([iOS](https://apps.apple.com/au/app/tuya-smart/id1034649547) / [Android](https://play.google.com/store/apps/details?id=com.tuya.smart&hl=en_AU&gl=US&pli=1))

## 2 - Sign up for an IoT account

Go to https://iot.tuya.com and click Sign Up

![signup](https://user-images.githubusercontent.com/82495132/120384295-d2c95100-c2da-11eb-930d-75eaad628f4f.png)

* Fill in your information
* Make up a company name if you need to

![signup-info](https://user-images.githubusercontent.com/82495132/120384453-099f6700-c2db-11eb-8cbc-20f3bc5bb17f.png)

* Check Agree to Terms
* Click Agree
* You'll be emailed a code, enter it

## 3 - Sign in at iot.tuya.com

## 4 - Create a cloud project

* Click through the intro
* On the sidebar click cloud, then projects
* Click Free Trial under TRIAL EDITION

![freetrial](https://user-images.githubusercontent.com/82495132/120384723-60a53c00-c2db-11eb-8f79-f2a2f38dbc8a.png)

* Click Buy now in the new tab

![buynow](https://user-images.githubusercontent.com/82495132/120384754-69960d80-c2db-11eb-802c-7067dff3274a.png)

* Close the Tuya Value Added Service tab/popup
* In the Tuya IoT Platform tab, click Subscribed to be taken back to Cloud -> Projects
* Click create

![create](https://user-images.githubusercontent.com/82495132/120384789-7a468380-c2db-11eb-9770-8bdd41d65a3a.png)

* Make sure you pick smart home PAAS and the correct region, this affects whether you will be able to access your devices in the following steps. Click create

![createproject](https://user-images.githubusercontent.com/82495132/120386067-04431c00-c2dd-11eb-93ff-27371397e1e2.png)

* Click Authorize for the recommended APIs

![authorize](https://user-images.githubusercontent.com/82495132/120384846-87637280-c2db-11eb-8a3c-b2fd256f68d5.png)

## 5 - Link devices registered in Tuya app to the IoT site

* From your project, click the link devices tab, then Link devices by App Account, then Add App Account

![addappaccount](https://user-images.githubusercontent.com/82495132/120385095-d7dad000-c2db-11eb-9e4c-595af4502154.png)

* In the Tuya Smart app, click me at the bottom, then the scan button, then scan your QR code

![scan2](https://user-images.githubusercontent.com/82495132/120385375-2f793b80-c2dc-11eb-9343-c579fc288962.png)

* Confirm the sign in

## 6 - Get the keys for your devices

* Go to the device list tab
* Copy the device ID for your device

![devices](https://user-images.githubusercontent.com/484912/204113199-a7ffd1c6-7f22-4295-a3a1-948ba15643b2.png)

* In the sidebar, hover over "Cloud" and click on "API Explorer"

![apiexplorer](https://user-images.githubusercontent.com/484912/204113419-3d106164-eff8-4ff3-a4f5-c7f2a025de96.png)

* In the sidebar, search for "get device information" endpoint and click on the highlighted option. (It should be under "General Devices management" section. Note: there is also another endpoint called "Get _the_ device information" which will not work.)

* In the "device_id" text field, paste in the device ID you copied and click "Submit Request"

* In the "Response" section, there should be a property called `local_key` which is your local key.

![localkey](https://user-images.githubusercontent.com/484912/204113337-81ebe3c3-5f3a-4854-a069-aa929bfb145d.png)

## 7 - Video Tutorial

* [YouTube](https://youtu.be/FpY-xsY-pZ8)
