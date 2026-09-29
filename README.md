# The Roster

A premium contact directory built with plain HTML, CSS, and JavaScript — no frameworks, no build step.

## Fields captured per card
- First name
- Last name
- Age
- Contact number
- Department (optional)
- Profile picture (optional)
- Pinned (optional)

## Features
- Add, edit, and delete cards through a slide-in form drawer
- Upload a profile picture — shown as a circular portrait, with initials as a fallback
- Pin important cards to a "Pinned" section at the top of the list
- Cards are grouped and sorted alphabetically by last name by default, with a clickable A–Z rail to jump to a letter
- Sort by last name, first name, age, or most recently added
- Filter by department using auto-generated chips (with live counts), in addition to search
- Live search across name, contact number, and department
- Export the whole roster to a CSV file
- Deleting a card shows an "Undo" toast for a few seconds before it's permanently removed
- Keyboard shortcuts: `/` focuses search, `N` opens a new card, `Esc` closes the form
- Dark / light theme toggle, remembered across visits
- Data is saved to the browser's `localStorage`, so cards persist between visits on the same device/browser

## Running it
No build tools needed. Just open `index.html` in a browser, or serve the folder with any static server, e.g.:

```
npx serve .
```

## Project structure
```
index.html        Markup and form
css/style.css      Styling
js/script.js       App logic (storage, rendering, form handling)
```

## Notes
- Profile pictures are stored as base64 data directly in `localStorage`, so very large images will use more storage space. For a production version, consider uploading images to a server or object storage instead.
- All data is local to the browser it's used in — there is no server or account system.
