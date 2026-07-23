# Pop Up Upload Flow

## Backend Page

List URL:

```text
https://new-shop.ezvizlife.com/popup/index
```

Edit URL after clicking Add:

```text
https://new-shop.ezvizlife.com/popup/edit
```

## Manual Flow

1. Login with the target website account.
2. Open `https://shop.ezvizlife.com/templates/index`.
3. Click `Popup` in the left sidebar.
4. Click `Add`.
5. Prepare `Web Url` and `Mobile Url` with the UTM rule below.
6. Fill the fields listed below.
7. Upload the country image through the image upload control.
8. Click `Submit`.
9. Back on the list page, click `Enable` if the new popup should go live.

## Fields Needed

For the concise batch field list, see `popup-config.md`.

| Field | Required | Current test value | Notes |
|---|---:|---|---|
| Popup Name | Yes | `DE Popup Test` | Text input, placeholder `Please Enter Popup Name`. |
| Popup Type | No | `Image` | Radio group. Default is `Image`; alternative is `Html`. |
| Popup Brief | Yes | `DE popup configuration test` | Textarea, placeholder `Please Enter Popup Brief`. |
| Where to Show | Yes | `all page` | Select options observed: `home page`, `all page`, `custom page`. |
| Start Time | Yes | `2026-06-25 14:50:21` | Date-time picker, readonly input `#startTime`. |
| End Time | Yes | `2026-06-30 14:50:39` | Date-time picker, readonly input `#endTime`. |
| Frequency | Yes | `once per day` | Select options observed: `only once`, `once per day`. |
| Web Url | Yes | `https://www.ezviz.com` | Textarea, placeholder `Please Enter Web Url`. |
| Mobile Url | Yes | `https://www.ezviz.com` | Textarea, placeholder `Please Enter Mobile Url`. |
| Image | Yes | `<项目目录>\assets\campaign\de-popup.jpg` | Standard `input[type=file]`, accepts jpg/jpeg/png/gif. |
| Status | After submit | `Enable` | New popup was saved as `Disable`; clicked `Enable` in the list to activate. |

## Click URL UTM Rule

This rule applies to both `Web Url` and `Mobile Url`.

- If the URL points to an internal EZVIZ domain, add or overwrite these UTM values:
  - `utm_source={siteCode}_popup`
  - `utm_medium=popup`
  - `utm_campaign=web_{siteCode}_popup`
- Internal domains include `ezviz.com`, `www.ezviz.com`, `ezvizlife.com`, `www.ezvizlife.com`, and their subdomains.
- If the URL points to an external domain, keep it unchanged and do not add UTM.
- If the popup already has wrong or missing UTM values, overwrite them with the correct values before submitting.

Use the helper before filling the backend form:

```powershell
node .\campaign-url-tools\scripts\campaign-url.mjs --site es --placement popup --url "https://www.ezviz.com/es"
```

## Created Test Record

- Popup Name: `DE Popup Test`
- Popup Brief: `DE popup configuration test`
- Period: `2026-06-25 14:50:21 to 2026-06-30 14:50:39`
- Frequency: `once per day`
- Status: `Enable`
- Popup Type: `image`
- Uploaded image URL observed: `https://s3.amazonaws.com/mfs.ezvizlife.com/8f1f859de552d66e7829540c09a24585.jpg`

## Automation Notes

For one-click multi-site setup, parameterize:

- target account domain, such as `www.ezviz.com/fr`
- popup name
- popup brief
- where-to-show option
- start time
- end time
- frequency
- web URL
- mobile URL
- local image path, such as `<项目目录>\assets\campaign\de-popup.jpg`
- whether to enable after submit
