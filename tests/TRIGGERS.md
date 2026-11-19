# Trigger test results

An agent client loads a skill from its `name` and `description` alone. This file records which skill a client picks for each prompt in [triggers.json](triggers.json). Use it to judge a change of a description against evidence.

## Method

1. Read only the 13 names and descriptions, not the bodies.
2. For each prompt, pick the one skill that a client loads, or `none` when no Taskade skill fits.
3. Compare the pick with the expected skill. A miss is a defect only when the description is at fault, not the prompt.
4. After a change of a description, judge every prompt again. A prompt that passed before must still pass.

`node scripts/check-triggers.mjs` checks what a machine can prove: the limits of the name and the description, the YAML rule of `check.mjs`, a "Use when" clause, the size of the test set, the skill names in it, and the collisions. It cannot judge a pick. A person or an agent judges the picks and updates this file.

A collision is a pair of descriptions whose content words overlap at 0.14 or above (Jaccard index, with the skill names and the words that every description has left out). A collision passes when one description names the other skill and the test set has a near-miss prompt in each direction. Run `node scripts/check-triggers.mjs --overlap` for the value of each pair.

## Result

| | Prompts | Pass | Miss |
|---|---|---|---|
| Before the changes of version 0.6.3 | 202 | 199 | 3 |
| After the changes of version 0.6.3 | 202 | 202 | 0 |

No prompt that passed before fails after the changes.

Collisions that the check found on version 0.6.2: taskade-check-app and taskade-secure-app (0.23), taskade-fix-app and taskade-fix-first-screen (0.22), taskade-check-app and taskade-fix-app (0.16), taskade and taskade-check-app (0.15), taskade-repo-to-project and taskade-spreadsheet-to-app (0.15), taskade-clone-kit and taskade-publish-app (0.15), taskade-fix-app and taskade-secure-app (0.15), taskade-markdown and taskade-repo-to-project (0.15). Each pair names the other skill and has a near miss in each direction. No prompt between these pairs missed. On version 0.6.3 the check finds the first 6 of them. The new words lower the overlap of taskade-clone-kit and taskade-publish-app, and of taskade-markdown and taskade-repo-to-project, below the limit.

## Misses and causes

| Prompt | Expected | Pick | Cause |
|---|---|---|---|
| start a new project from the weekly planner template in taskade | taskade | taskade-clone-kit | The description of taskade-clone-kit quotes "use this template" and does not say that a project template is out of its scope. Taskade has project templates and app kits. The front door creates a project from a template. |
| ask my sales agent which deals are closing this week | taskade | taskade-build-agent | The description of taskade-build-agent is the only one about agents, and it does not exclude a question for an agent that works. The front door asks an agent with `prompt_agent`. |
| export my launch project from taskade as a markdown file | taskade | taskade-markdown | The name and the description match "Markdown file", and the description does not say that it writes only files for an import. The front door reads a project. |

## Changes of the descriptions in version 0.6.3

Each change adds one sentence or one clause. No body changed.

### taskade-clone-kit

Before:

> Copy a Taskade app kit into the user's workspace and make it theirs in 3 steps (their name and look, their data, their automations on), with a check after each step. Use when the user says "use this template", "clone this kit", "copy this app", "make this app mine", "I found an app on taskade.com/apps", or names a kit page. To build a new app from an idea, use taskade-build-app instead. Next jobs are taskade-spreadsheet-to-app to bring in the user's real rows, taskade-check-app to check the copy, taskade-publish-app to publish it.

After:

> Copy a Taskade app kit into the user's workspace and make it theirs in 3 steps (their name and look, their data, their automations on), with a check after each step. Use when the user says "use this template", "clone this kit", "copy this app", "make this app mine", "I found an app on taskade.com/apps", or names a kit page. To build a new app from an idea, use taskade-build-app instead. For a project template, use the front door taskade. Next jobs are taskade-spreadsheet-to-app to bring in the user's real rows, taskade-check-app to check the copy, taskade-publish-app to publish it.

Fixed: "start a new project from the weekly planner template in taskade".

### taskade-build-agent

Before:

> Create, tune and test a custom AI agent in the user's Taskade workspace, with instructions that the user approves, the projects and files that it must know, and a few approved test questions with each answer shown. Use when the user says "make me an agent", "build an AI agent in Taskade", "train an agent on my docs", "teach my agent about my business", "my agent gives wrong answers", "change my agent's instructions", "test my agent" or "delete my agent". Not for an automation (Taskade EVE builds it, see the front door taskade), a broken app (taskade-fix-app) or a new app (taskade-build-app).

After:

> Create, tune and test a custom AI agent in the user's Taskade workspace, with instructions that the user approves, the projects and files that it must know, and a few approved test questions with each answer shown. Use when the user says "make me an agent", "build an AI agent in Taskade", "train an agent on my docs", "teach my agent about my business", "my agent gives wrong answers", "change my agent's instructions", "test my agent" or "delete my agent". Not for asking an agent to do work (the front door taskade), an automation (Taskade EVE builds it, see the front door taskade), a broken app (taskade-fix-app) or a new app (taskade-build-app).

Fixed: "ask my sales agent which deals are closing this week".

### taskade-markdown

Before:

> Write a Markdown or CSV file that Taskade turns into a clean project, and tell the user how to bring it in. Writing the file needs no Taskade account and no MCP connection. Use when the user asks for a plan, checklist, outline or task list "for Taskade", wants to move notes from another app into Taskade, or asks which Markdown Taskade keeps. For rows with duplicate checks in a project that exists, use taskade-spreadsheet-to-app. For a new app, use taskade-build-app.

After:

> Write a Markdown or CSV file that Taskade turns into a clean project, and tell the user how to bring it in. Writing the file needs no Taskade account and no MCP connection. Use when the user asks for a plan, checklist, outline or task list "for Taskade", wants to move notes from another app into Taskade, or asks which Markdown Taskade keeps. For rows with duplicate checks in a project that exists, use taskade-spreadsheet-to-app. For a new app, use taskade-build-app. Not for an export of a Taskade project (the front door taskade reads it).

Fixed: "export my launch project from taskade as a markdown file".

## Notes

- The descriptions use the imperative ("Copy a Taskade app kit"), not the third person. The check does not require the third person.
- Some prompts name no product, for example "turn this xlsx into something my team can use". They assume that the Taskade skills are installed.

## Table

A pick in bold is a miss.

### taskade

| Prompt | Kind | Expected | Pick before | Pick after |
|---|---|---|---|---|
| set up taskade in my claude code | must | taskade | taskade | taskade |
| connect my taskade account pls | must | taskade | taskade | taskade |
| what can you do in taskade for me | must | taskade | taskade | taskade |
| whats in my workspace | must | taskade | taskade | taskade |
| add a task to the Launch project to book the venue for friday | must | taskade | taskade | taskade |
| show my content plan as a board instead of a list | must | taskade | taskade | taskade |
| why is my calender empty, i added dates to everything | must | taskade | taskade | taskade |
| the taskade tool keeps saying i need to upgrade | must | taskade | taskade | taskade |
| hook up taskade to cursor | must | taskade | taskade | taskade |
| move the call the printer task to tomorrow and assign it to Sam | must | taskade | taskade | taskade |
| how much does taskade cost for a team of 5 | must | taskade | taskade | taskade |
| run my daily digest automation now | must | taskade | taskade | taskade |
| check my apps and tell me what to fix first | near miss | taskade-check-app | taskade-check-app | taskade-check-app |
| import leads.csv into my CRM project, skip duplicates | near miss | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app |
| weekly status report of my workspace | near miss | taskade-report | taskade-report | taskade-report |
| make me an agent that answers refund questions from our policy doc | near miss | taskade-build-agent | taskade-build-agent | taskade-build-agent |
| publish my app | near miss | taskade-publish-app | taskade-publish-app | taskade-publish-app |
| build me a booking app for my studio | near miss | taskade-build-app | taskade-build-app | taskade-build-app |
| whats the weather in lisbon tomorrow | near miss | none | none | none |

### taskade-build-app

| Prompt | Kind | Expected | Pick before | Pick after |
|---|---|---|---|---|
| build me an app for my agency's clients | must | taskade-build-app | taskade-build-app | taskade-build-app |
| I need a client portal | must | taskade-build-app | taskade-build-app | taskade-build-app |
| need a simple CRM for my roofing company | must | taskade-build-app | taskade-build-app | taskade-build-app |
| can u make a booking system for my hair salon | must | taskade-build-app | taskade-build-app | taskade-build-app |
| turn our onboarding process into an app | must | taskade-build-app | taskade-build-app | taskade-build-app |
| i want a dashbord that shows our sales numbers | must | taskade-build-app | taskade-build-app | taskade-build-app |
| plan an inventory tracker for my bakery before we build anything | must | taskade-build-app | taskade-build-app | taskade-build-app |
| my team logs repair requests on paper, can taskade run that for us | must | taskade-build-app | taskade-build-app | taskade-build-app |
| i want my students to hand in homework online and i grade it | must | taskade-build-app | taskade-build-app | taskade-build-app |
| something where my staff can log maintenance requests and I approve them | must | taskade-build-app | taskade-build-app | taskade-build-app |
| make an app with an AI agent that qualifies new leads | must | taskade-build-app | taskade-build-app | taskade-build-app |
| use the CRM kit from taskade.com/apps and make it mine | near miss | taskade-clone-kit | taskade-clone-kit | taskade-clone-kit |
| turn this xlsx of customers into a table in taskade | near miss | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app |
| make me an AI agent that answers questions about our menu | near miss | taskade-build-agent | taskade-build-agent | taskade-build-agent |
| my booking app shows a blank page | near miss | taskade-fix-app | taskade-fix-app | taskade-fix-app |
| scaffold a react app with vite on my laptop | near miss | none | none | none |

### taskade-spreadsheet-to-app

| Prompt | Kind | Expected | Pick before | Pick after |
|---|---|---|---|---|
| import this spreadsheet into taskade | must | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app |
| turn this xlsx into something my team can use | must | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app |
| load my leads from leads.csv | must | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app |
| add these 300 contacts to my CRM, no dupes pls | must | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app |
| put my product catalog excel into the inventory app | must | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app |
| here is clients.csv from my old crm, get it into taskade | must | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app |
| update my stock project from the new inventory.xlsx without making doubles | must | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app |
| i have a sheet of volunteers with names and phone numbers, make it a taskade table | must | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app |
| 500 rows of products in this file, bring them into the shop app but skip the ones already there | must | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app |
| write a CSV I can import into Taskade for my wedding checklist | near miss | taskade-markdown | taskade-markdown | taskade-markdown |
| build me a CRM app with a pipeline page and follow up automations | near miss | taskade-build-app | taskade-build-app | taskade-build-app |
| excel formula to sum column B only if column A says paid | near miss | none | none | none |
| turn the open github issues of this repo into a taskade project | near miss | taskade-repo-to-project | taskade-repo-to-project | taskade-repo-to-project |
| how many leads in my pipeline are overdue | near miss | taskade-report | taskade-report | taskade-report |

### taskade-clone-kit

| Prompt | Kind | Expected | Pick before | Pick after |
|---|---|---|---|---|
| clone this kit and make it mine | must | taskade-clone-kit | taskade-clone-kit | taskade-clone-kit |
| I found a CRM on taskade.com/apps, can I use it for my business | must | taskade-clone-kit | taskade-clone-kit | taskade-clone-kit |
| use this template from the taskade gallery for my gym | must | taskade-clone-kit | taskade-clone-kit | taskade-clone-kit |
| copy the client portal kit into my workspace and put my colors on it | must | taskade-clone-kit | taskade-clone-kit | taskade-clone-kit |
| theres an app on your site i like, the restaurant one. can i have it | must | taskade-clone-kit | taskade-clone-kit | taskade-clone-kit |
| how do i rebrand a kit i just cloned | must | taskade-clone-kit | taskade-clone-kit | taskade-clone-kit |
| i copied the booking kit, swap in my business name and turn its automations on | must | taskade-clone-kit | taskade-clone-kit | taskade-clone-kit |
| got a link to an app kit from a friend, set it up for me | must | taskade-clone-kit | taskade-clone-kit | taskade-clone-kit |
| start from a ready made kit instead of building from scratch | must | taskade-clone-kit | taskade-clone-kit | taskade-clone-kit |
| build me a booking app from scratch | near miss | taskade-build-app | taskade-build-app | taskade-build-app |
| publish a new version of my kit | near miss | taskade-publish-app | taskade-publish-app | taskade-publish-app |
| make a copy of my app before I change it | near miss | taskade-publish-app | taskade-publish-app | taskade-publish-app |
| git clone this repo and make tasks from its TODOs | near miss | taskade-repo-to-project | taskade-repo-to-project | taskade-repo-to-project |
| bring my real customer list into the kit I cloned, from customers.csv | near miss | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app |
| start a new project from the weekly planner template in taskade | near miss | taskade | **taskade-clone-kit** (miss) | taskade |

### taskade-build-agent

| Prompt | Kind | Expected | Pick before | Pick after |
|---|---|---|---|---|
| make me an agent | must | taskade-build-agent | taskade-build-agent | taskade-build-agent |
| build an AI agent that answers my clients from my price list | must | taskade-build-agent | taskade-build-agent | taskade-build-agent |
| train an agent on my docs | must | taskade-build-agent | taskade-build-agent | taskade-build-agent |
| my support bot keeps making up refund rules | must | taskade-build-agent | taskade-build-agent | taskade-build-agent |
| change the instructions of my sales agent | must | taskade-build-agent | taskade-build-agent | taskade-build-agent |
| test my agent with a few questions before I share it | must | taskade-build-agent | taskade-build-agent | taskade-build-agent |
| delete the old HR agent | must | taskade-build-agent | taskade-build-agent | taskade-build-agent |
| teach my assistant our services and opening hours | must | taskade-build-agent | taskade-build-agent | taskade-build-agent |
| my agent cant see the new pricing doc i uploaded | must | taskade-build-agent | taskade-build-agent | taskade-build-agent |
| make a chatbot that answers questions about my courses | must | taskade-build-agent | taskade-build-agent | taskade-build-agent |
| embed my support agent on my website | must | taskade-build-agent | taskade-build-agent | taskade-build-agent |
| build me an app that my clients log into | near miss | taskade-build-app | taskade-build-app | taskade-build-app |
| I need a lead tracker app where an agent scores each new lead | near miss | taskade-build-app | taskade-build-app | taskade-build-app |
| set up an automation that posts to slack every monday | near miss | taskade | taskade | taskade |
| ask my sales agent which deals are closing this week | near miss | taskade | **taskade-build-agent** (miss) | taskade |
| the contact form on my app does nothing when I click send | near miss | taskade-fix-app | taskade-fix-app | taskade-fix-app |
| write a system prompt for my custom gpt in chatgpt | near miss | none | none | none |

### taskade-check-app

| Prompt | Kind | Expected | Pick before | Pick after |
|---|---|---|---|---|
| is my app ok | must | taskade-check-app | taskade-check-app | taskade-check-app |
| check my apps | must | taskade-check-app | taskade-check-app | taskade-check-app |
| run a health check on my portal before launch | must | taskade-check-app | taskade-check-app | taskade-check-app |
| what should i fix first in my taskade apps | must | taskade-check-app | taskade-check-app | taskade-check-app |
| audit my app, dont change anything | must | taskade-check-app | taskade-check-app | taskade-check-app |
| is my app ready to share with clients | must | taskade-check-app | taskade-check-app | taskade-check-app |
| go through my booking app and tell me whats broken | must | taskade-check-app | taskade-check-app | taskade-check-app |
| is anything wrong with my apps | must | taskade-check-app | taskade-check-app | taskade-check-app |
| give my portal a once-over before I send it to clients | must | taskade-check-app | taskade-check-app | taskade-check-app |
| which of my apps need attention | must | taskade-check-app | taskade-check-app | taskade-check-app |
| the submit button on my app does nothing, fix it | near miss | taskade-fix-app | taskade-fix-app | taskade-fix-app |
| clients can see each others invoices in my portal | near miss | taskade-secure-app | taskade-secure-app | taskade-secure-app |
| my app looks cheap on mobile | near miss | taskade-fix-first-screen | taskade-fix-first-screen | taskade-fix-first-screen |
| are my automations working this week | near miss | taskade-report | taskade-report | taskade-report |
| what is in my workspace | near miss | taskade | taskade | taskade |
| check my spelling in this paragraph | near miss | none | none | none |

### taskade-fix-app

| Prompt | Kind | Expected | Pick before | Pick after |
|---|---|---|---|---|
| my app is broken | must | taskade-fix-app | taskade-fix-app | taskade-fix-app |
| my app shows a blank page after I published it | must | taskade-fix-app | taskade-fix-app | taskade-fix-app |
| the save button does nothing | must | taskade-fix-app | taskade-fix-app | taskade-fix-app |
| data doesnt show up in my app even tho the project has rows | must | taskade-fix-app | taskade-fix-app | taskade-fix-app |
| my clients see an error when they log in | must | taskade-fix-app | taskade-fix-app | taskade-fix-app |
| change the heading on the home page of my app to Book a call | must | taskade-fix-app | taskade-fix-app | taskade-fix-app |
| when my customers click Book now nothing happens | must | taskade-fix-app | taskade-fix-app | taskade-fix-app |
| the jobs page says No jobs yet but there are 20 jobs in the project | must | taskade-fix-app | taskade-fix-app | taskade-fix-app |
| my app is stuck on loading forever | must | taskade-fix-app | taskade-fix-app | taskade-fix-app |
| the form on my app stopped sending me the email | must | taskade-fix-app | taskade-fix-app | taskade-fix-app |
| make my app look less generic on phones | near miss | taskade-fix-first-screen | taskade-fix-first-screen | taskade-fix-first-screen |
| health check of all my apps | near miss | taskade-check-app | taskade-check-app | taskade-check-app |
| who can see the client list in my portal | near miss | taskade-secure-app | taskade-secure-app | taskade-secure-app |
| undo my last change to the app | near miss | taskade-publish-app | taskade-publish-app | taskade-publish-app |
| fix the failing test in my python script | near miss | none | none | none |

### taskade-fix-first-screen

| Prompt | Kind | Expected | Pick before | Pick after |
|---|---|---|---|---|
| my app looks generic | must | taskade-fix-first-screen | taskade-fix-first-screen | taskade-fix-first-screen |
| it looks AI made, make it look pro | must | taskade-fix-first-screen | taskade-fix-first-screen | taskade-fix-first-screen |
| looks bad on my phone | must | taskade-fix-first-screen | taskade-fix-first-screen | taskade-fix-first-screen |
| nobody clicks anything when they open my app | must | taskade-fix-first-screen | taskade-fix-first-screen | taskade-fix-first-screen |
| visitors leave right away | must | taskade-fix-first-screen | taskade-fix-first-screen | taskade-fix-first-screen |
| my app looks like every other template | must | taskade-fix-first-screen | taskade-fix-first-screen | taskade-fix-first-screen |
| on my iphone the buttons are tiny and you have to scroll sideways | must | taskade-fix-first-screen | taskade-fix-first-screen | taskade-fix-first-screen |
| make the home screen of my app show the numbers right away | must | taskade-fix-first-screen | taskade-fix-first-screen | taskade-fix-first-screen |
| the first thing people see in my portal is a wall of text | must | taskade-fix-first-screen | taskade-fix-first-screen | taskade-fix-first-screen |
| the page is blank | near miss | taskade-fix-app | taskade-fix-app | taskade-fix-app |
| check my app before i share it | near miss | taskade-check-app | taskade-check-app | taskade-check-app |
| build me a new app for my yoga studio | near miss | taskade-build-app | taskade-build-app | taskade-build-app |
| publish the new first screen | near miss | taskade-publish-app | taskade-publish-app | taskade-publish-app |
| change the font on my wordpress blog | near miss | none | none | none |

### taskade-secure-app

| Prompt | Kind | Expected | Pick before | Pick after |
|---|---|---|---|---|
| who can see my app | must | taskade-secure-app | taskade-secure-app | taskade-secure-app |
| who can see the client list in my portal | must | taskade-secure-app | taskade-secure-app | taskade-secure-app |
| make my app private | must | taskade-secure-app | taskade-secure-app | taskade-secure-app |
| my customers can see each others bookings!! | must | taskade-secure-app | taskade-secure-app | taskade-secure-app |
| is my app safe to share | must | taskade-secure-app | taskade-secure-app | taskade-secure-app |
| lock down my portal so only people i invite can sign up | must | taskade-secure-app | taskade-secure-app | taskade-secure-app |
| can strangers write to my private list through the public form | must | taskade-secure-app | taskade-secure-app | taskade-secure-app |
| before I publish, make sure strangers cant see the leads | must | taskade-secure-app | taskade-secure-app | taskade-secure-app |
| anyone with the link can sign up to my portal, i dont want that | must | taskade-secure-app | taskade-secure-app | taskade-secure-app |
| i dont want randos reading my lead list | must | taskade-secure-app | taskade-secure-app | taskade-secure-app |
| publish my app | near miss | taskade-publish-app | taskade-publish-app | taskade-publish-app |
| back up my app before I release it | near miss | taskade-publish-app | taskade-publish-app | taskade-publish-app |
| check my whole app for problems | near miss | taskade-check-app | taskade-check-app | taskade-check-app |
| the login page of my app shows an error | near miss | taskade-fix-app | taskade-fix-app | taskade-fix-app |
| how do i turn on two factor login for my taskade account | near miss | taskade | taskade | taskade |
| change my wifi password | near miss | none | none | none |

### taskade-publish-app

| Prompt | Kind | Expected | Pick before | Pick after |
|---|---|---|---|---|
| publish my app | must | taskade-publish-app | taskade-publish-app | taskade-publish-app |
| release a new version of my kit | must | taskade-publish-app | taskade-publish-app | taskade-publish-app |
| back up my app | must | taskade-publish-app | taskade-publish-app | taskade-publish-app |
| export my app | must | taskade-publish-app | taskade-publish-app | taskade-publish-app |
| save a copy before I change it | must | taskade-publish-app | taskade-publish-app | taskade-publish-app |
| undo my last change | must | taskade-publish-app | taskade-publish-app | taskade-publish-app |
| push the fix live, safely | must | taskade-publish-app | taskade-publish-app | taskade-publish-app |
| how do i roll back my app if the update breaks it | must | taskade-publish-app | taskade-publish-app | taskade-publish-app |
| make the new version live | must | taskade-publish-app | taskade-publish-app | taskade-publish-app |
| take a snapshot of the app before you edit anything | must | taskade-publish-app | taskade-publish-app | taskade-publish-app |
| my kit buyers should get the new features | must | taskade-publish-app | taskade-publish-app | taskade-publish-app |
| who can open my app once it is live | near miss | taskade-secure-app | taskade-secure-app | taskade-secure-app |
| make my app private before publishing | near miss | taskade-secure-app | taskade-secure-app | taskade-secure-app |
| fix the bug on the pricing page and then publish | near miss | taskade-fix-app | taskade-fix-app | taskade-fix-app |
| copy a kit from the taskade gallery into my workspace | near miss | taskade-clone-kit | taskade-clone-kit | taskade-clone-kit |
| publish my blog post on wordpress | near miss | none | none | none |

### taskade-report

| Prompt | Kind | Expected | Pick before | Pick after |
|---|---|---|---|---|
| weekly report pls | must | taskade-report | taskade-report | taskade-report |
| status of my taskade workspace | must | taskade-report | taskade-report | taskade-report |
| how is my pipeline | must | taskade-report | taskade-report | taskade-report |
| whats overdue | must | taskade-report | taskade-report | taskade-report |
| are my automations working | must | taskade-report | taskade-report | taskade-report |
| summarize my projects | must | taskade-report | taskade-report | taskade-report |
| how many invoices are still unpaid this month | must | taskade-report | taskade-report | taskade-report |
| give me a one page update on our projects that i can send my boss | must | taskade-report | taskade-report | taskade-report |
| what needs my attention today | must | taskade-report | taskade-report | taskade-report |
| did any automation break overnight | must | taskade-report | taskade-report | taskade-report |
| check my app for problems | near miss | taskade-check-app | taskade-check-app | taskade-check-app |
| show my tasks as a calendar | near miss | taskade | taskade | taskade |
| import my sales figures from sales.csv | near miss | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app |
| write my meeting notes as a markdown checklist i can paste into taskade | near miss | taskade-markdown | taskade-markdown | taskade-markdown |
| write a quarterly report for investors about the market | near miss | none | none | none |

### taskade-markdown

| Prompt | Kind | Expected | Pick before | Pick after |
|---|---|---|---|---|
| write me a launch checklist for taskade | must | taskade-markdown | taskade-markdown | taskade-markdown |
| make a markdown outline I can import into Taskade | must | taskade-markdown | taskade-markdown | taskade-markdown |
| move my notion notes into taskade | must | taskade-markdown | taskade-markdown | taskade-markdown |
| which markdown does taskade keep when I paste | must | taskade-markdown | taskade-markdown | taskade-markdown |
| give me a csv i can upload to taskade for my wedding tasks | must | taskade-markdown | taskade-markdown | taskade-markdown |
| how do I get my apple notes into taskade | must | taskade-markdown | taskade-markdown | taskade-markdown |
| draft a packing list I can paste into taskade | must | taskade-markdown | taskade-markdown | taskade-markdown |
| i dont have taskade yet, but write my project plan so I can import it later | must | taskade-markdown | taskade-markdown | taskade-markdown |
| does taskade keep tables when i paste them | must | taskade-markdown | taskade-markdown | taskade-markdown |
| import these 200 rows into my existing leads project, skip duplicates | near miss | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app |
| put the roadmap.md and the TODO comments of this repo into taskade and keep it in sync | near miss | taskade-repo-to-project | taskade-repo-to-project | taskade-repo-to-project |
| write a status report of my workspace | near miss | taskade-report | taskade-report | taskade-report |
| build me an app to plan my wedding | near miss | taskade-build-app | taskade-build-app | taskade-build-app |
| export my launch project from taskade as a markdown file | near miss | taskade | **taskade-markdown** (miss) | taskade |
| write a README in markdown for my npm package | near miss | none | none | none |

### taskade-repo-to-project

| Prompt | Kind | Expected | Pick before | Pick after |
|---|---|---|---|---|
| put this repo's roadmap in taskade | must | taskade-repo-to-project | taskade-repo-to-project | taskade-repo-to-project |
| turn the TODOs into tasks | must | taskade-repo-to-project | taskade-repo-to-project | taskade-repo-to-project |
| sync my github issues to a taskade project | must | taskade-repo-to-project | taskade-repo-to-project | taskade-repo-to-project |
| make a taskade project from this PRD | must | taskade-repo-to-project | taskade-repo-to-project | taskade-repo-to-project |
| update the taskade project from the repo | must | taskade-repo-to-project | taskade-repo-to-project | taskade-repo-to-project |
| whats left to do in this codebase, put it where the PM can see it | must | taskade-repo-to-project | taskade-repo-to-project | taskade-repo-to-project |
| grab all the FIXMEs and make tasks out of them | must | taskade-repo-to-project | taskade-repo-to-project | taskade-repo-to-project |
| mirror the open issues of our gh repo in taskade, no dupes | must | taskade-repo-to-project | taskade-repo-to-project | taskade-repo-to-project |
| our spec is in docs/spec.md, can the team track it in taskade | must | taskade-repo-to-project | taskade-repo-to-project | taskade-repo-to-project |
| write a markdown checklist for my move that taskade can import | near miss | taskade-markdown | taskade-markdown | taskade-markdown |
| import bugs.csv into my bug tracker project | near miss | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app | taskade-spreadsheet-to-app |
| weekly status of the dev project in taskade | near miss | taskade-report | taskade-report | taskade-report |
| build a bug tracker app for my team | near miss | taskade-build-app | taskade-build-app | taskade-build-app |
| fix the TODO in utils.ts | near miss | none | none | none |
