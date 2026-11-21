# 排排坐 · SeatManager

A classroom seating planner for teachers. Open `index.html` in a browser (or GitHub Pages); there is nothing to install. Everything is saved automatically in the browser, and **Save / Open** writes and reads a `.ppz.json` file so you can keep one file per class.

## Features

1. **Layout** (`js/layout.js`): place desks on an empty floor. Add single desks or ready-made groups of 4 or 6, drag them around, box-select, duplicate (Ctrl+D), delete and nudge with the arrow keys. You can also generate rows (single desks or in pairs). Select desks and click **Make a group** to form groups, and double-click a group label to rename it.
2. **Four languages**: English, 中文, Bahasa Melayu and தமிழ் (`js/i18n.js`).
3. **Class list import**: paste text or choose a `.txt`, `.csv` or `.xlsx` file, with one student per line. Names can be in any language. Gender is optional and can go after a comma or tab (`M/F`, `男/女`, `L/P`, `ஆண்/பெண்`, `boy/girl` …). For Excel, put the name in the first column and the gender in the second. Click the ♂/♀ button next to a name to change gender later.
4. **Seating**: assign randomly or balance boys and girls (by group and between neighbours). You can add conditions such as *A must not sit next to B* or *A must not be in the same group as B*. Arranging by hand also works: drag a name onto a desk, or click a name and then click a desk. Drag one desk onto another to swap the two students, and drag a name back to the list to take them off their seat.
5. **Roles**: click a student's name to give them roles. Group leader and class monitor are built in, and you can add, rename or delete your own roles.

To use it offline, click **Download for offline use** (top right) to get the zip, unzip it, and open `index.html`.

Print the plan with **Print**. It fits the classroom onto one landscape page.

SheetJS (`js/vendor/xlsx.full.min.js`, Apache-2.0) is bundled so that Excel import also works offline.
