# Calendar link helper

A tiny function that lets Breathing Room read a calendar from its secret iCal link (Google, Outlook, Apple, or any calendar that gives an `.ics` link).

Browsers block a web page from reading a calendar link on another site, so this one step runs on Vercel: it fetches the link and passes the calendar straight back. **It stores and logs nothing.** It only accepts public `https://` or `webcal://` addresses and only returns iCal data.

Deploy: `npx vercel@latest deploy --prod` from this folder.
