# LostLink AI Product Demo Video Script

**Estimated runtime:** 8-10 minutes  
**Live website:** https://onestsolo-hackathon-1frontend.onrender.com/  
**Demo organization:** ABC School  
**Demo password:** `lostlink123`

> This script is written for a live product walkthrough. Keep the browser on the deployed website, use the HashRouter links below, and narrate what is happening while the page loads.

## Demo Story

A student loses a black backpack near the library. They report it with identifying details. Another person reports finding a similar backpack. LostLink AI compares both reports, gives staff a ranked match, verifies ownership, and records the secure return.

The demo then switches to the organization view to show how staff, security, administrators, and owners manage the recovery operation.

## 0:00-0:35 - Landing Page

**Open:** [LostLink AI landing page](https://onestsolo-hackathon-1frontend.onrender.com/)

**On screen:** Show the hero section, the lost-item and AI recovery cards, and the primary call-to-action.

**Voiceover:**

> Welcome to LostLink AI, an intelligent lost-and-found platform for schools, companies, campuses, hospitals, and events.
>
> Lost-and-found work is usually scattered across messages, paper forms, spreadsheets, and informal conversations. LostLink AI brings that process into one secure workflow.
>
> A person reports a lost or found item, the AI compares the reports, staff verify the claimant, and the organization completes a traceable return. The result is faster recovery with less manual searching and better accountability.

**Action:** Point to the recovery stages: report, match, verify, and return. Click **Get Started** or **Sign In**.

## 0:35-1:25 - Sign In and Account Options

**Open:** [Login page](https://onestsolo-hackathon-1frontend.onrender.com/#/login)

**Voiceover:**

> The login page supports both existing users and new organization members. A person can sign in, create an account, join an organization, or create a new organization as an administrator.
>
> LostLink AI detects an organization from a verified email domain when possible. For example, an address ending in `@abcschool.com` can be connected to ABC School automatically. A user on a personal Gmail or Yahoo address can join with an organization invite code instead.

### Login example

Use the seeded demo account:

- **Email:** `admin@abcschool.com`
- **Password:** `lostlink123`

Explain that the same product supports different role permissions after sign-in. A member sees personal recovery tools, while staff and managers see organization operations.

### Create an account and join an organization

**Action for the recording:** Open the create-account flow, show the two choices, and then return to the seeded login so the demo data remains available.

Choose **Join an Organization** and narrate:

> A student or employee enters their name, email, password, and invite code when needed. If the email domain is recognized, the organization is detected and the account joins automatically. With a free email domain, the organization provides a code such as `ABCS1234`.

Example:

- Name: `Samarth Patil`
- Email: `student@abcschool.com`
- Organization: `ABC School`
- Role after joining: `member`

### Create an organization

Return to the choice screen and select **Create an Organization**.

**Voiceover:**

> An organization administrator creates an account first, then enters the organization name, type, email domain, location, and optional logo. For example, an administrator can create `ABC School`, choose `School`, enter `abcschool.com`, and set the location to Pune, Maharashtra.
>
> The creator becomes the organization owner. Members using the verified domain can join automatically, while people using personal email addresses can use an invite code.

Do not complete this flow during the main recording unless a clean test organization is available. Use the existing ABC School demo account for the rest of the video.

## 1:25-2:10 - User Dashboard Home

**Open:** [User dashboard](https://onestsolo-hackathon-1frontend.onrender.com/#/dashboard)

**Voiceover:**

> This is the personal dashboard. It answers the member's most important question: what needs my attention now?
>
> The home view provides quick access to Search, Report, Matches, and Recovery. It also surfaces active matches, recent reports, notifications, and recovery progress.
>
> A member does not need organization-admin access to recover an item. They can create their own report, search the organization records they are allowed to see, answer verification questions, and use a pickup QR code when a return is ready.

**Show:**

- Active matches and confidence indicators
- Recent reports
- Recovery progress from reported to matched, verified, and returned
- Notifications and the profile/account controls

**Role note:** A `member` can create reports, view their own cases, view matches, answer ownership questions, view their own return, and use a return QR code.

## 2:10-2:45 - Home Search

**Open:** [Search](https://onestsolo-hackathon-1frontend.onrender.com/#/search)

**Voiceover:**

> Search is organization-scoped. The user can search by an item name, description, category, location, brand, color, or visible mark.
>
> The results are grouped into lost reports, found reports, and AI matches. This means a member can search for a black backpack and immediately see whether another person has reported a similar found item or whether the system has already produced a candidate match.

**Action:** Search for `backpack`, open one result, point out the report type, status, location, date, image, and identifying details. Explain that users only see data permitted by their organization role.

## 2:45-4:00 - Report an Item: Two Options

**Open:** [Report](https://onestsolo-hackathon-1frontend.onrender.com/#/report)

**Voiceover:**

> Reporting is split into two clear paths: Report Lost and Report Found. Both use a guided form so the information is structured for search and AI matching.

### Option 1: Report a lost item

**Action:** Select **Lost**.

Narrate the form step by step:

1. **Item basics:** Choose a category such as bag, electronics, clothing, documents, keys, or another item type. Enter an item name such as `Black backpack`.
2. **Photo:** Upload a clear image if one is available. The photo gives the matching system visual evidence.
3. **Description:** Add identifying details: `black backpack with a blue stripe, small white ABC School logo, and a silver zipper`.
4. **Place and time:** Enter where and when it was lost, for example `ABC School library` and `September 25 at 3:30 PM`.
5. **Review and submit:** Confirm the details and submit the report.

**Voiceover:**

> The more specific the description, image, location, and time are, the stronger the later comparison can be. After submission, the report is visible in the member's recovery area and becomes eligible for matching.

### Option 2: Report a found item

**Action:** Switch to **Found**.

Narrate the second path:

1. Select the category and name, for example `Black backpack`.
2. Upload a photo of the found item without exposing sensitive contents.
3. Describe visible features such as the blue stripe, school logo, zipper, stickers, or damage.
4. Enter where it was found, for example `Library reception`, and the discovery date and time.
5. Submit the found report.

**Voiceover:**

> A staff member, security officer, or any authorized member can report a found item. The report does not reveal ownership automatically. It enters the organization's controlled recovery process so a claimant must still prove ownership.

For the recording, either submit a test report or open an existing report from the seeded demo data. Avoid creating duplicate data if the live database already contains the example.

## 4:00-4:40 - Matches and Recovery Home

**Open:** [Matches](https://onestsolo-hackathon-1frontend.onrender.com/#/matches) and then [Recovery](https://onestsolo-hackathon-1frontend.onrender.com/#/recovery)

**Voiceover:**

> Matches shows AI-generated candidates between lost and found reports. Each candidate includes a confidence score and the evidence that made the comparison useful.
>
> The system can combine visual similarity, semantic description, attributes such as color and brand, location, time, and context. AI does not release an item by itself. It prioritizes the cases that staff should review first.
>
> Recovery is the member's case timeline. It brings together reports, match progress, ownership verification, return readiness, and completed handover.

**Action:** Open a high-confidence match, show both the lost and found sides, then open the recovery case. Explain the progression:

`Reported -> Matching -> Potential match -> Verification -> Verified -> Return ready -> Returned`

**Role note:** Members can view their own matches and cases. Staff and security can work across organization cases according to their permissions.

## 4:40-5:20 - Match Detail, Verification, and Return

**Voiceover:**

> A possible match is not the same as a confirmed owner. The next step is verification.
>
> The claimant answers ownership questions or provides identifying information that is not visible in the public report. Staff review the answers and decide whether the evidence is sufficient.
>
> Once ownership is verified, the organization can authorize a return. The system records the handover, pickup code or QR flow, responsible staff member, timestamps, and final status. This creates a chain of custody instead of an informal exchange.

**Action:** Show the match detail, verification screen, and return QR or recovery timeline if available.

**Security message:** Do not read private verification answers aloud in the video. Demonstrate the status transition and the auditability of the workflow instead.

## 5:20-6:00 - Organization Dashboard Overview

**Open:** [Organization Overview](https://onestsolo-hackathon-1frontend.onrender.com/#/organization/overview)

Log in as an organization role if needed. Use an owner/admin demo account for all six navigation links.

**Voiceover:**

> Now I am switching from the personal portal to the organization command center. The organization dashboard shows activity across the whole tenant instead of only one member's reports.
>
> Overview gives managers an operational snapshot: report volume, lost and found totals, active matches, pending claims, members, and recovery progress. This is the first screen an owner or administrator can use to understand whether the recovery queue needs attention.

**Show:** Summary cards, activity chart, report status distribution, active organization, and the link back to the personal dashboard.

## 6:00-6:45 - Organization Recovery

**Open:** [Organization Recovery](https://onestsolo-hackathon-1frontend.onrender.com/#/organization/recovery)

**Voiceover:**

> Recovery is the working queue for reports and AI candidates. Staff can review lost and found reports, filter by status and type, open the match detail, and move a case through the recovery process.
>
> The organization team can see the same evidence in a controlled staff view: report photos, descriptions, timestamps, locations, candidate scores, and the current case status.

**Role actions:**

- `staff`: review all reports, update report status, review matches, review claims, authorize and complete returns, and view custody records.
- `security`: review organization reports and matches, review available verification information, authorize or complete a handover, and view custody records.
- `admin` and `owner`: perform the staff workflow and also access organization management, analytics, audit history, and member controls.

## 6:45-7:25 - Claims and Verification

**Open:** [Organization Claims](https://onestsolo-hackathon-1frontend.onrender.com/#/organization/verification)

**Voiceover:**

> Claims is where the organization protects the handover. A claimant's request is linked to a report and, when available, a candidate match.
>
> Staff review the claimant's answers and evidence, approve or reject the claim, and leave notes for the organization record. Approval moves the item toward return readiness. Rejection keeps the case controlled and prevents an unverified person from collecting the item.
>
> This step is especially important for schools and workplaces because a visually similar item is not enough proof of ownership.

**Action:** Open a pending or completed claim, point to the claimant, linked report, verification state, decision, and timeline. Do not expose unnecessary personal data in the recording.

## 7:25-8:05 - Operations

**Open:** [Organization Operations](https://onestsolo-hackathon-1frontend.onrender.com/#/organization/operations)

**Voiceover:**

> Operations covers the physical work after a match is found. Teams can track item custody, returns, pickup readiness, and last-seen or CCTV evidence when that feature is available for the case.
>
> The chain-of-custody record answers who handled an item, when it moved, where it was stored, and whether the final handover was completed. This turns the recovery process into a traceable operational record.

**Action:** Show the Operations tabs, then open an item or custody record. Point out status, location, staff action, timestamps, and return completion.

**Role note:** Security and staff are the primary operational users. Admin and owner can review the operation and its audit trail. Members see the result through their own Recovery and return screens.

## 8:05-8:45 - Insights

**Open:** [Organization Insights](https://onestsolo-hackathon-1frontend.onrender.com/#/organization/insights)

**Voiceover:**

> Insights turns recovery activity into organization-level information. Managers can review report volume, match rate, return rate, resolution rate, verified returns, unresolved cases, and activity over time.
>
> The same area also supports audit visibility for management roles. This helps an organization understand whether items are being recovered quickly, where cases stall, and which operational improvements are needed.

**Role note:** Insights and audit views are manager features for `admin` and `owner` roles. Staff and security focus on the live queue and physical return workflow.

## 8:45-9:25 - People and Organization Management

**Open:** [Organization People](https://onestsolo-hackathon-1frontend.onrender.com/#/organization/people)

**Voiceover:**

> People is the organization directory and access-control area. Administrators can see members, roles, verification state, active membership, and organization settings. They can invite members, manage staff access, and keep the organization profile current.
>
> The owner has the highest control level, including organization transfer. Administrators manage day-to-day settings and membership. Staff and security work cases without receiving the owner-level organization controls.
>
> The role model keeps the product useful for every participant while limiting sensitive actions to the people responsible for them.

**Role summary:**

| Role | Main capabilities |
|---|---|
| `member` | Create reports, view personal cases and matches, answer verification questions, view personal notifications, and use a return QR code. |
| `staff` | Work organization reports and matches, review claims, update statuses, authorize and complete returns, and view custody. |
| `security` | Review organization reports and matches, support verification, authorize or complete physical handovers, and view custody. |
| `admin` | All operational work plus people, invites, organization settings, insights, and audit access. |
| `owner` | All admin capabilities plus ownership transfer and full organization control. |

## 9:25-10:00 - Closing Workflow

**Return to:** [Organization Overview](https://onestsolo-hackathon-1frontend.onrender.com/#/organization/overview) or the landing page.

**Voiceover:**

> LostLink AI connects the complete recovery journey.
>
> A member reports a lost item or a staff member reports a found item. Search and AI matching connect the relevant cases. Staff or security verify ownership. Operations records custody and completes the return. Managers use Insights and People to improve the organization over time.
>
> LostLink AI replaces scattered messages and manual searching with a secure, explainable, role-aware recovery workflow.
>
> This is LostLink AI: lost today, found tomorrow.

## Recording Checklist

### Before recording

- [ ] Open https://onestsolo-hackathon-1frontend.onrender.com/
- [ ] Confirm the frontend is using the current deployed build.
- [ ] Sign in with `admin@abcschool.com` and `lostlink123`.
- [ ] Confirm ABC School demo data is visible.
- [ ] Keep one high-confidence match and one verification case ready.
- [ ] Avoid showing database credentials, private passwords, or private verification answers.

### Main route order

1. [Landing page](https://onestsolo-hackathon-1frontend.onrender.com/)
2. [Login](https://onestsolo-hackathon-1frontend.onrender.com/#/login)
3. [User Home](https://onestsolo-hackathon-1frontend.onrender.com/#/dashboard)
4. [Search](https://onestsolo-hackathon-1frontend.onrender.com/#/search)
5. [Report](https://onestsolo-hackathon-1frontend.onrender.com/#/report)
6. [Matches](https://onestsolo-hackathon-1frontend.onrender.com/#/matches)
7. [Recovery](https://onestsolo-hackathon-1frontend.onrender.com/#/recovery)
8. [Organization Overview](https://onestsolo-hackathon-1frontend.onrender.com/#/organization/overview)
9. [Organization Recovery](https://onestsolo-hackathon-1frontend.onrender.com/#/organization/recovery)
10. [Claims](https://onestsolo-hackathon-1frontend.onrender.com/#/organization/verification)
11. [Operations](https://onestsolo-hackathon-1frontend.onrender.com/#/organization/operations)
12. [Insights](https://onestsolo-hackathon-1frontend.onrender.com/#/organization/insights)
13. [People](https://onestsolo-hackathon-1frontend.onrender.com/#/organization/people)

### Final message for the video

> Report it. Match it. Verify it. Return it. LostLink AI makes recovery organized, intelligent, and accountable.
