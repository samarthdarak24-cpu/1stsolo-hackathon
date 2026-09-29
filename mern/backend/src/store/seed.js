/**
 * Seed data — realistic demo content so every screen has something real to show.
 * Runs only when the organizations collection is empty (idempotent). Passwords
 * for all demo accounts: lostlink123
 */
const { getDriver } = require('../store');
// Services used by the seed. Required up here, not mid-function, because the
// recovery-board block that builds the ownership challenges runs before the
// original verification block further down.
// eslint-disable-next-line global-require
const matching = require('../services/matchingService');
// eslint-disable-next-line global-require
const verificationService = require('../services/verificationService');
// eslint-disable-next-line global-require
const notificationService = require('../services/notificationService');
const { photoFor } = require('./itemPhotos');

const FREE_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'proton.me', 'protonmail.com', 'aol.com', 'mail.com', 'gmx.com', 'yandex.com', 'zoho.com', 'rediffmail.com'];

const daysAgo = (n) => new Date(Date.now() - n * 86400000);

/**
 * Append one row to the chain-of-custody ledger. A function declaration on
 * purpose: the recovery-board block below writes custody rows before the
 * original "chain of custody" section, and a hoisted declaration avoids a
 * temporal-dead-zone error that a `const` arrow would hit.
 */
const custody = (record) => getDriver().createCustodyRecord(record);

async function seed() {
  const store = getDriver();
  const orgs = await store.listOrgs();
  if (orgs.length > 0) {
    for (const org of orgs) {
      // Upgrade existing demo rows from drawn artwork to the curated photo set.
      // This keeps a persistent Render database in sync without resetting user data.
      const { reports } = await store.listReports(org.id, { limit: 500 });
      for (const report of reports) {
        const photos = photoFor(report.itemProfile?.itemName);
        const isSeedArtwork = /^\/uploads\/items\/[^/]+\.svg$/i.test(report.images?.[0] || '');
        if (photos && isSeedArtwork && report.images[0] !== photos[0]) {
          const updated = await store.updateReport(report.id, {
            images: photos,
            embedding: [],
            embeddingSources: {},
            embeddingUpdatedAt: null
          });
          generateEmbeddings(updated).catch((err) => {
            console.warn(`[embeddings] could not refresh ${updated.reference}: ${err.message}`);
          });
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log('[seed] organizations already present — skipping seed');
    return;
  }

  // eslint-disable-next-line no-console
  console.log('[seed] empty database detected — creating demo data');

  /* ---------------- organizations ---------------- */
  const abc = await store.createOrg({
    name: 'ABC School', type: 'school', emailDomain: 'abcschool.com',
    location: 'Pune, Maharashtra', inviteCode: 'ABCS1234',
    settings: { pickupLocation: 'Security Desk', matchThreshold: 35, highConfidence: 85, requireVerification: true, instructions: 'Present your one-time QR at the Security Desk and confirm your identity.' }
  });
  const xyz = await store.createOrg({
    name: 'XYZ Company', type: 'company', emailDomain: 'xyzcompany.com',
    location: 'Bengaluru, Karnataka', inviteCode: 'XYZC5678',
    settings: { pickupLocation: 'Front Office', matchThreshold: 35, highConfidence: 85, requireVerification: true, instructions: 'Collect your item from the Front Office with your QR code.' }
  });
  const tech = await store.createOrg({
    name: 'TechCorp', type: 'company', emailDomain: 'techcorp.com',
    location: 'Hyderabad, Telangana', inviteCode: 'TECH9001',
    settings: { pickupLocation: 'Facilities Desk, Lobby', matchThreshold: 35, highConfidence: 85, requireVerification: true, instructions: 'Collect from the Facilities Desk in the lobby. Bring your employee badge and the one-time code.' }
  });
  const hospital = await store.createOrg({
    name: 'City Hospital', type: 'hospital', emailDomain: 'cityhospital.org',
    location: 'Mumbai, Maharashtra', inviteCode: 'CITY2026',
    settings: { pickupLocation: 'Patient Relations Counter', matchThreshold: 30, highConfidence: 80, requireVerification: true, instructions: 'Present your patient wristband and the handover code at Patient Relations. Items are released only to verified patients.' }
  });
  const hack = await store.createOrg({
    name: 'Hackathon 2026', type: 'event', emailDomain: 'hackathon.dev',
    location: 'Online / Venue TBC', inviteCode: 'HACK2026',
    settings: { pickupLocation: 'Check-in Desk, Main Hall', matchThreshold: 30, highConfidence: 75, requireVerification: false, instructions: 'Bring your badge wristband to the check-in desk. Verification is optional but recommended.' }
  });

  /* ---------------- users ---------------- */
  const mkUser = (name, email, role, orgId, activeOrgId) => store.createUser({ name, email, password: 'lostlink123' })
    .then(u => store.addMembership(u.id, orgId, role).then(() => store.updateUser(u.id, { isVerified: true, activeOrgId: activeOrgId || orgId })));

  const adminAbc = await mkUser('Dana Whitfield', 'admin@abcschool.com', 'owner', abc.id);
  const studentAbc = await mkUser('Samarth Patil', 'student@abcschool.com', 'member', abc.id);
  const staffAbc = await mkUser('Grace Fernandes', 'staff@abcschool.com', 'staff', abc.id);
  const securityAbc = await mkUser('Rohan Kulkarni', 'security@abcschool.com', 'security', abc.id);

  // Populate the ABC School roster with 100 realistic members to make the
  // People, directory, admin dashboards and org insights screens feel real on
  // first login without relying on any hidden mock data.
  const abcSeedNames = [
    'Aarav', 'Aisha', 'Ananya', 'Arjun', 'Diya', 'Esha', 'Ishaan', 'Kabir', 'Kavya', 'Meher',
    'Naira', 'Nikhil', 'Prisha', 'Raghav', 'Riya', 'Sai', 'Sana', 'Tanvi', 'Vihaan', 'Yash',
    'Zoya', 'Aditya', 'Bhavya', 'Chetan', 'Dev', 'Harsh', 'Ira', 'Jai', 'Kriti', 'Lavanya',
    'Mihir', 'Neha', 'Om', 'Pari', 'Qasim', 'Reyansh', 'Sakshi', 'Tushar', 'Uma', 'Veda',
    'Wahab', 'Xena', 'Yuvraj', 'Zain', 'Aditi', 'Bharat', 'Chaitra', 'Dhanush', 'Eklavya', 'Farah',
    'Gaurav', 'Hina', 'Jhanvi', 'Karan', 'Leah', 'Mira', 'Naman', 'Ojas', 'Pooja', 'Rohan',
    'Siddharth', 'Tara', 'Udit', 'Vansh', 'Warda', 'Yamini', 'Zenia', 'Aman', 'Bina', 'Chinmay',
    'Disha', 'Evan', 'Faisal', 'Gita', 'Harini', 'Ishita', 'Jugal', 'Krisha', 'Lalit', 'Mansi',
    'Nandini', 'Omkar', 'Pankaj', 'Ritika', 'Saurabh', 'Tanya', 'Urvashi', 'Vikram', 'Wasim', 'Yashvi',
    'Zafar', 'Aanya', 'Brijesh', 'Cynthia', 'Dhruv', 'Esha', 'Feroz', 'Gayatri', 'Himanshu', 'Jiya'
  ];
  const abcSeedSurnames = [
    'Patel', 'Sharma', 'Reddy', 'Iyer', 'Nair', 'Singh', 'Kapoor', 'Mehta', 'Desai', 'Khan',
    'Joshi', 'Menon', 'Verma', 'Saxena', 'Gupta', 'Nandan', 'Bose', 'Kulkarni', 'Chopra', 'Sen',
    'Roy', 'Malhotra', 'Mishra', 'Pillai', 'Arora', 'Bhatia', 'Das', 'Dutta', 'Khanna', 'Jain',
    'Banerjee', 'Yadav', 'Rao', 'Fernandes', 'Tomar', 'Agarwal', 'Sethi', 'Rastogi', 'Bhatt', 'Madan',
    'Kamble', 'Dhingra', 'Sodhi', 'Gokhale', 'Davids', 'Shaikh', 'Wagle', 'Sinha', 'Purohit', 'Vora'
  ];

  const seedAbcOrganizationMembers = async (orgId, total = 100) => {
    for (let i = 1; i <= total; i += 1) {
      const firstName = abcSeedNames[(i - 1) % abcSeedNames.length];
      const lastName = abcSeedSurnames[(i * 3) % abcSeedSurnames.length];
      const role = i <= 4 ? 'owner' : i <= 16 ? 'staff' : i <= 32 ? 'security' : 'member';
      const email = `abcmember${String(i).padStart(3, '0')}@abcschool.com`;
      const user = await store.createUser({
        name: `${firstName} ${lastName}`,
        email,
        password: 'lostlink123'
      });
      await store.addMembership(user.id, orgId, role);
      await store.updateUser(user.id, { isVerified: true, activeOrgId: orgId });
    }
  };
  await seedAbcOrganizationMembers(abc.id, 100);

  const employeeXyz = await mkUser('Maya Chen', 'employee@xyzcompany.com', 'member', xyz.id);
  const adminXyz = await mkUser('Ravi Iyer', 'admin@xyzcompany.com', 'owner', xyz.id);

  // TechCorp — a larger company roster, so the members table and role filters
  // have enough real rows to be worth looking at.
  const adminTech = await mkUser('Ananya Rao', 'admin@techcorp.com', 'owner', tech.id);
  const engineerTech = await mkUser('Vikram Desai', 'student@techcorp.com', 'member', tech.id);
  const staffTech = await mkUser('Meera Nair', 'staff@techcorp.com', 'staff', tech.id);
  const securityTech = await mkUser('Imran Sheikh', 'security@techcorp.com', 'security', tech.id);
  await mkUser('Priya Menon', 'hr@techcorp.com', 'admin', tech.id);

  // City Hospital — the staff/security split matters here because patient items
  // are only ever released after a verification review.
  const adminHospital = await mkUser('Dr. Neha Rao', 'admin@cityhospital.org', 'owner', hospital.id);
  const patientHospital = await mkUser('Arjun Mehta', 'student@cityhospital.org', 'member', hospital.id);
  const nurseHospital = await mkUser('Sister Lily Thomas', 'staff@cityhospital.org', 'staff', hospital.id);
  const securityHospital = await mkUser('Deepak Kulkarni', 'security@cityhospital.org', 'security', hospital.id);

  // Hackathon 2026 — an event org with a relaxed verification policy, so the
  // same match flows reach a different set of screens.
  const adminHack = await mkUser('Karthik Iyer', 'admin@hackathon.dev', 'owner', hack.id);
  const hackerHack = await mkUser('Sara Lindqvist', 'student@hackathon.dev', 'member', hack.id);
  const mentorHack = await mkUser('Omar Haddad', 'staff@hackathon.dev', 'staff', hack.id);

  // Samarth is also a member of XYZ so org switching has a second option.
  await store.addMembership(studentAbc.id, xyz.id, 'member', { activate: false });

  /* ---------------- reports (ABC School) ---------------- */
  const profile = (o) => ({ shape: 'Rectangular', material: 'Fabric', size: 'Medium', ...o });

  // Demo artwork, so the UI has real pictures to show.
  // scripts/generateItemArt.js writes these SVGs into uploads/items and the
  // app already serves that directory read-only at /uploads. Keeping the list
  // here (rather than importing the generator) means seeding does not depend on
  // the script having been run, and the URLs stay stable in git.
  const art = (slug) => {
    const photoSlug = ['black-handbag', 'blue-tablet', 'silver-watch', 'black-headphones',
      'black-sunglasses', 'teal-water-bottle', 'navy-track-pants', 'silver-laptop-stand',
      'grey-wireless-mouse', 'student-id-card'].includes(slug) ? slug : null;
    return [photoSlug ? `/uploads/items/photo/${photoSlug}.jpg` : `/uploads/items/${slug}.svg`];
  };

  // Item name -> artwork file. Kept as an explicit map rather than a
  // slugify-the-name rule, because the drawn filenames are our choice and a
  // silent fallback would quietly ship a mismatched picture.
  const ART_BY_ITEM = {
    'Black Backpack': 'black-backpack',
    'Hydro Flask': 'hydro-flask',
    'Laptop Sleeve': 'navy-laptop-sleeve',
    'Keyring with Keys': 'keyring-keys',
    'Blue Folding Umbrella': 'blue-umbrella',
    'Mechanical Keyboard': 'mechanical-keyboard',
    'Access Badge': 'access-badge',
    'Brown Leather Wallet': 'leather-wallet',
    'Reading Glasses': 'reading-glasses',
    'Grey Sports Shoe': 'grey-sports-shoe',
    'USB-C Charger': 'usb-c-charger',
    'Black A5 Notebook': 'black-a5-notebook',
    'Phone in Clear Case': 'phone-clear-case',
    'Black Glasses Case': 'grey-glasses-case',
    'Laptop Sticker Pack': 'laptop-sticker-pack',
    'Blue Headphones': 'blue-headphones',
    // The ABC School / XYZ Company recovery board (see SCHOOL_ITEMS / COMPANY_ITEMS
    // below). Same rule as the rows above: no slugify fallback, so a picture can
    // never quietly disagree with the item name it is attached to.
    'Black Handbag': 'black-handbag',
    'Blue Tablet': 'blue-tablet',
    'Silver Watch': 'silver-watch',
    'Black Headphones': 'black-headphones',
    'Black Sunglasses': 'black-sunglasses',
    'Teal Water Bottle': 'teal-water-bottle',
    'Navy Track Pants': 'navy-track-pants',
    'Silver Laptop Stand': 'silver-laptop-stand',
    'Grey Wireless Mouse': 'grey-wireless-mouse',
    'Student ID Card': 'student-id-card',
    'Black Notebook': 'black-notebook',
    'Green Umbrella': 'green-umbrella',
    'White Charger Brick': 'white-charger-brick',
    'Brown Sunglasses': 'brown-sunglasses',
    'Orange Coffee Mug': 'orange-mug',
    'Red Hoodie': 'red-hoodie',
    'Black Earbuds': 'black-earbuds',
    'Leather Notebook': 'leather-notebook',
    'Black Phone Pouch': 'black-phone-pouch',
    'White Laptop Charger': 'white-laptop-charger'
  };
  const artSlug = (itemName) => ART_BY_ITEM[itemName] || 'generic-item';

  // Every seeded report is created "now", but describes an event that happened
  // days ago. Mongoose stamps createdAt at insert time, so without this the
  // whole demo history lands on the seed-run date: the 7/30/90-day filters all
  // return the same rows and the volume chart collapses to a single bar. Wrapping
  // createReport keeps the real event date (lostAt/foundAt) as createdAt, which
  // is what the period filters, analytics and "time proximity" score read.
  const rawCreateReport = store.createReport.bind(store);
  store.createReport = async (report) => {
    const created = await rawCreateReport(report);
    const eventAt = report.lostAt || report.foundAt;
    if (eventAt) await store.backdateReport(created.id, eventAt);
    return { ...created, createdAt: eventAt || created.createdAt };
  };


  const lostBackpack = await store.createReport({
    organizationId: abc.id, userId: studentAbc.id, type: 'LOST',
    itemProfile: profile({ itemName: 'Black Backpack', category: 'Backpack', primaryColor: 'Black', secondaryColor: 'Blue', brand: 'Wildcraft', visibleMark: 'White mountain logo', finderNotes: 'Books and a water bottle inside the main compartment' }),
    images: art('black-backpack'), description: 'Lost my black Wildcraft backpack with a white mountain logo on the front and a blue zip pull. The main compartment had my books and a water bottle.',
    category: 'Backpack', location: 'Central Library, 2nd Floor', lostAt: daysAgo(1), status: 'VERIFICATION_PENDING'
  });

  const foundBackpack = await store.createReport({
    organizationId: abc.id, userId: staffAbc.id, type: 'FOUND',
    itemProfile: profile({ itemName: 'Black Backpack', category: 'Backpack', primaryColor: 'Black', secondaryColor: 'Blue', brand: 'Wildcraft', visibleMark: 'White mountain logo on the front', finderNotes: 'Books and a water bottle inside the main compartment' }),
    images: art('black-backpack'), description: 'Found a black Wildcraft backpack with a white mountain logo on the front and a blue zip pull near the library returns desk. It still had books and a water bottle inside.',
    category: 'Backpack', location: 'Central Library, Returns Desk', foundAt: daysAgo(0.4), status: 'MATCHED'
  });

  const lostAdminLaptop = await store.createReport({
    organizationId: abc.id, userId: adminAbc.id, type: 'LOST',
    itemProfile: profile({ itemName: 'Laptop Sleeve', category: 'Laptop', primaryColor: 'Navy', material: 'Neoprene', shape: 'Rectangular', visibleMark: 'No branding, orange zipper pull' }),
    images: art('navy-laptop-sleeve'), description: 'My navy neoprene laptop sleeve with an orange zipper pull was left on my desk in the principal office during the parent meeting. It held a 14-inch laptop and charger.',
    category: 'Laptop', location: 'Administration Office, Desk 2', lostAt: daysAgo(1.2), status: 'VERIFICATION_PENDING'
  });

  const foundAdminLaptop = await store.createReport({
    organizationId: abc.id, userId: securityAbc.id, type: 'FOUND',
    itemProfile: profile({ itemName: 'Laptop Sleeve', category: 'Laptop', primaryColor: 'Navy', material: 'Neoprene', shape: 'Rectangular', visibleMark: 'Orange zipper pull' }),
    images: art('navy-laptop-sleeve'), description: 'Found a navy neoprene laptop sleeve with an orange zipper pull on the admin office desk after a parent meeting. It had a laptop and charger inside.',
    category: 'Laptop', location: 'Administration Office, Desk 2', foundAt: daysAgo(0.9), status: 'MATCHED'
  });

  const lostAdminBadge = await store.createReport({
    organizationId: abc.id, userId: adminAbc.id, type: 'LOST',
    itemProfile: profile({ itemName: 'Access Badge', category: 'Electronics', primaryColor: 'White', material: 'Plastic', shape: 'Small', visibleMark: 'Photo of the school crest on the front' }),
    images: art('access-badge'), description: 'I lost my white school access badge with the ABC crest on the front near the staff entrance by the security cabin.',
    category: 'Electronics', location: 'Staff Entrance, Gate 1', lostAt: daysAgo(3.1), status: 'POTENTIAL_MATCH'
  });

  const foundAdminBadge = await store.createReport({
    organizationId: abc.id, userId: staffAbc.id, type: 'FOUND',
    itemProfile: profile({ itemName: 'Access Badge', category: 'Electronics', primaryColor: 'White', material: 'Plastic', shape: 'Small', visibleMark: 'School crest on the front' }),
    images: art('access-badge'), description: 'Found a white school access badge with the ABC crest on the front near the staff entrance security cabin.',
    category: 'Electronics', location: 'Staff Entrance, Gate 1', foundAt: daysAgo(2.8), status: 'MATCHED'
  });

  const lostFlask = await store.createReport({
    organizationId: abc.id, userId: studentAbc.id, type: 'LOST',
    itemProfile: profile({ itemName: 'Hydro Flask', category: 'Water Bottle', primaryColor: 'Green', brand: 'Hydro Flask', material: 'Stainless Steel', shape: 'Tall', visibleMark: 'Etched mountain logo' }),
    images: art('hydro-flask'), description: 'Left my green Hydro Flask 32oz stainless steel bottle in the sports complex gym. Wide mouth cap and an etched mountain logo near the base.',
    category: 'Water Bottle', location: 'Sports Complex Gymnasium', lostAt: daysAgo(2), status: 'POTENTIAL_MATCH'
  });

  const foundFlask = await store.createReport({
    organizationId: abc.id, userId: securityAbc.id, type: 'FOUND',
    itemProfile: profile({ itemName: 'Hydro Flask', category: 'Water Bottle', primaryColor: 'Green', brand: 'Hydro Flask', material: 'Stainless Steel', shape: 'Tall', visibleMark: 'Etched mountain logo' }),
    images: art('hydro-flask'), description: 'Found a green Hydro Flask 32oz stainless steel bottle in the sports complex changing area. Wide mouth cap and an etched mountain logo near the base.',
    category: 'Water Bottle', location: 'Sports Complex, Changing Area', foundAt: daysAgo(1.6), status: 'MATCHED'
  });

  const lostLaptop = await store.createReport({
    organizationId: abc.id, userId: studentAbc.id, type: 'LOST',
    itemProfile: profile({ itemName: 'Laptop Sleeve', category: 'Laptop', primaryColor: 'Navy', material: 'Neoprene', shape: 'Rectangular', visibleMark: 'None' }),
    images: art('navy-laptop-sleeve'), description: 'Left my navy neoprene laptop sleeve (15-inch) in Meeting Room 3B after a lecture.',
    category: 'Laptop', location: 'Academic Block, Room 3B', lostAt: daysAgo(4), status: 'MATCHED'
  });

  const foundKeys = await store.createReport({
    organizationId: abc.id, userId: staffAbc.id, type: 'FOUND',
    itemProfile: profile({ itemName: 'Keyring with Keys', category: 'Keys', primaryColor: 'Black', material: 'Metal', shape: 'Small', visibleMark: 'Red tag' }),
    images: art('keyring-keys'), description: 'Found a small bunch of keys on a black ring with a red tag near the cafeteria.',
    category: 'Keys', location: 'Cafeteria', foundAt: daysAgo(0.8), status: 'FOUND'
  });

  /* ---------------- reports (XYZ Company) ---------------- */
  const lostUmbrella = await store.createReport({
    organizationId: xyz.id, userId: employeeXyz.id, type: 'LOST',
    itemProfile: profile({ itemName: 'Blue Folding Umbrella', category: 'Umbrella', primaryColor: 'Blue', material: 'Polyester', shape: 'Long', visibleMark: 'White handle' }),
    images: art('blue-umbrella'), description: 'Left a blue folding umbrella with a white handle at the office reception on the 4th floor.',
    category: 'Umbrella', location: 'Head Office, 4th Floor Reception', lostAt: daysAgo(1.2), status: 'POTENTIAL_MATCH'
  });

  const foundUmbrella = await store.createReport({
    organizationId: xyz.id, userId: adminXyz.id, type: 'FOUND',
    itemProfile: profile({ itemName: 'Blue Folding Umbrella', category: 'Umbrella', primaryColor: 'Blue', material: 'Polyester', visibleMark: 'White handle' }),
    images: art('blue-umbrella'), description: 'Handed in a blue folding umbrella with a white handle at the 4th-floor reception.',
    category: 'Umbrella', location: 'Head Office, 4th Floor Reception', foundAt: daysAgo(0.9), status: 'MATCHED'
  });

  /* ---------------- reports (TechCorp) ---------------- */
  const lostLaptopTech = await store.createReport({
    organizationId: tech.id, userId: engineerTech.id, type: 'LOST',
    itemProfile: profile({ itemName: 'Mechanical Keyboard', category: 'Electronics', primaryColor: 'Black', brand: 'Keychron', material: 'Aluminium', shape: 'Rectangular', visibleMark: 'Blue backlight, missing 2 keys' }),
    images: art('mechanical-keyboard'), description: 'Left my black Keychron mechanical keyboard on the hot-desk bench in the Hyderabad engineering bay. Blue backlight, two keycaps missing.',
    category: 'Electronics', location: 'Engineering Bay 3, Hyderabad', lostAt: daysAgo(1.5), status: 'VERIFICATION_PENDING'
  });

  const foundLaptopTech = await store.createReport({
    organizationId: tech.id, userId: securityTech.id, type: 'FOUND',
    itemProfile: profile({ itemName: 'Mechanical Keyboard', category: 'Electronics', primaryColor: 'Black', brand: 'Keychron', material: 'Aluminium', shape: 'Rectangular', visibleMark: 'Blue backlight, missing 2 keys' }),
    images: art('mechanical-keyboard'), description: 'Handed in a black Keychron mechanical keyboard found under the hot-desk bench in engineering bay 3. Blue backlight, two keycaps missing.',
    category: 'Electronics', location: 'Engineering Bay 3, Hyderabad', foundAt: daysAgo(1.1), status: 'MATCHED'
  });

  const lostBadgeTech = await store.createReport({
    organizationId: tech.id, userId: staffTech.id, type: 'LOST',
    itemProfile: profile({ itemName: 'Access Badge', category: 'Electronics', primaryColor: 'White', material: 'Plastic', shape: 'Small', visibleMark: 'Photo of a cartoon sticker on the reverse' }),
    images: art('access-badge'), description: 'Lost my white access badge with a cartoon sticker on the back. Last used at the Hyderabad office turnstile.',
    category: 'Electronics', location: 'Hyderabad Lobby Turnstile', lostAt: daysAgo(3), status: 'MATCHED'
  });

  const foundBadgeTech = await store.createReport({
    organizationId: tech.id, userId: staffTech.id, type: 'FOUND',
    itemProfile: profile({ itemName: 'Access Badge', category: 'Electronics', primaryColor: 'White', material: 'Plastic', shape: 'Small', visibleMark: 'Photo of a cartoon sticker on the reverse' }),
    images: art('access-badge'), description: 'Found a white access badge with a cartoon sticker on the reverse, wedged behind the lobby turnstile.',
    category: 'Electronics', location: 'Hyderabad Lobby Turnstile', foundAt: daysAgo(2.6), status: 'MATCHED'
  });

  /* ---------------- reports (City Hospital) ---------------- */
  // Patient property is the sensitive case: the description is deliberately
  // non-clinical, because a lost-property record must never become a medical one.
  const lostWalletHospital = await store.createReport({
    organizationId: hospital.id, userId: patientHospital.id, type: 'LOST',
    itemProfile: profile({ itemName: 'Brown Leather Wallet', category: 'Personal', primaryColor: 'Brown', material: 'Leather', shape: 'Small', visibleMark: 'Torn corner on the front flap' }),
    images: art('leather-wallet'), description: 'Lost my brown leather wallet with a torn corner on the front flap. It had a few cards inside. Left it in the OPD waiting area.',
    category: 'Personal', location: 'OPD Waiting Area, Block B', lostAt: daysAgo(1), status: 'POTENTIAL_MATCH'
  });

  const foundWalletHospital = await store.createReport({
    organizationId: hospital.id, userId: nurseHospital.id, type: 'FOUND',
    itemProfile: profile({ itemName: 'Brown Leather Wallet', category: 'Personal', primaryColor: 'Brown', material: 'Leather', shape: 'Small', visibleMark: 'Torn corner on the front flap' }),
    images: art('leather-wallet'), description: 'Found a brown leather wallet with a torn corner on the front flap under a chair in the OPD waiting area, Block B.',
    category: 'Personal', location: 'OPD Waiting Area, Block B', foundAt: daysAgo(0.7), status: 'MATCHED'
  });

  const foundSpectaclesHospital = await store.createReport({
    organizationId: hospital.id, userId: securityHospital.id, type: 'FOUND',
    itemProfile: profile({ itemName: 'Reading Glasses', category: 'Personal', primaryColor: 'Brown', material: 'Acetate', shape: 'Small', visibleMark: 'Thin silver wire frames' }),
    images: art('reading-glasses'), description: 'Found reading glasses with thin silver wire frames in the pharmacy queue at the main block.',
    category: 'Personal', location: 'Pharmacy Queue, Main Block', foundAt: daysAgo(0.4), status: 'FOUND'
  });

  /* ---------------- extra reports (depth, so no queue looks empty) ---------------- */
  // A batch of additional pairs, each with a realistic near-miss or a clean
  // second candidate. Without these the match queue shows one or two rows and
  // the organization looks like a toy demo.
  // Takes exactly (orgId, lostSpec, foundSpec); each spec carries its own userId.
  const extra = (orgId, lostSpec, foundSpec) => Promise.all([
    store.createReport({
      organizationId: orgId, userId: lostSpec.userId, type: 'LOST',
      itemProfile: profile(lostSpec.profile), images: art(artSlug(lostSpec.profile.itemName)),
      description: lostSpec.description, category: lostSpec.profile.category,
      location: lostSpec.location, lostAt: daysAgo(lostSpec.daysAgo), status: 'POTENTIAL_MATCH'
    }),
    store.createReport({
      organizationId: orgId, userId: foundSpec.userId, type: 'FOUND',
      itemProfile: profile(foundSpec.profile), images: art(artSlug(foundSpec.profile.itemName)),
      description: foundSpec.description, category: foundSpec.profile.category,
      location: foundSpec.location, foundAt: daysAgo(foundSpec.daysAgo), status: 'MATCHED'
    })
  ]);

  // ABC School — two more candidates, so the score filter and the "needs manual
  // review" lane both have real rows in them.
  const [[abcLostGlasses, abcFoundGlasses], [abcLostShoes, abcFoundShoes]] = await Promise.all([
    extra(abc.id, {
      userId: studentAbc.id, daysAgo: 5.2, location: 'Science Lab 2',
      description: 'Left my black rectangular glasses case in Science Lab 2 after the physics practical. The case has sticker residue on the lid.',
      profile: { itemName: 'Black Glasses Case', category: 'Personal', primaryColor: 'Black', material: 'Hard Shell', shape: 'Rectangular', visibleMark: 'Sticker residue on the lid' }
    }, {
      userId: staffAbc.id, daysAgo: 4.8, location: 'Science Lab 2',
      description: 'Handed in a black glasses case with sticker residue on the lid, found on the bench in Science Lab 2.',
      profile: { itemName: 'Black Glasses Case', category: 'Personal', primaryColor: 'Black', material: 'Hard Shell', shape: 'Rectangular', visibleMark: 'Sticker residue on the lid' }
    }),
    extra(abc.id, {
      userId: studentAbc.id, daysAgo: 6.4, location: 'Playground, North',
      description: 'Lost one grey sports shoe (left foot, size 8) at the north playground during practice. The sole is worn at the heel.',
      profile: { itemName: 'Grey Sports Shoe', category: 'Footwear', primaryColor: 'Grey', material: 'Mesh', shape: 'Large', visibleMark: 'Worn at the heel, left foot only' }
    }, {
      userId: securityAbc.id, daysAgo: 6.1, location: 'Playground, North',
      description: 'Found a single grey sports shoe, left foot size 8, worn at the heel, near the north playground fence.',
      profile: { itemName: 'Grey Sports Shoe', category: 'Footwear', primaryColor: 'Grey', material: 'Mesh', shape: 'Large', visibleMark: 'Worn at the heel, left foot only' }
    })
  ]);

  // TechCorp — two more candidates, one of which is rejected below so the
  // "already decided" lane has content too.
  const [[techLostCharger, techFoundCharger], [techLostNotebook, techFoundNotebook]] = await Promise.all([
    extra(tech.id, {
      userId: engineerTech.id, daysAgo: 2.2, location: 'Conference Room 2, Hyderabad',
      description: 'Left my black USB-C charger brick with a braided cable in Conference Room 2. It has a small blue dot sticker on the body.',
      profile: { itemName: 'USB-C Charger', category: 'Electronics', primaryColor: 'Black', material: 'Plastic', shape: 'Small', visibleMark: 'Blue dot sticker on the body' }
    }, {
      userId: staffTech.id, daysAgo: 1.9, location: 'Conference Room 2, Hyderabad',
      description: 'Handed in a black USB-C charger with a braided cable and a blue dot sticker, found under the conference table.',
      profile: { itemName: 'USB-C Charger', category: 'Electronics', primaryColor: 'Black', material: 'Plastic', shape: 'Small', visibleMark: 'Blue dot sticker on the body' }
    }),
    extra(tech.id, {
      userId: staffTech.id, daysAgo: 8, location: 'Hyderabad Cafeteria',
      description: 'Left a plain black A5 notebook, no labels, in the Hyderabad cafeteria. It has a coffee ring on the cover.',
      profile: { itemName: 'Black A5 Notebook', category: 'Stationery', primaryColor: 'Black', material: 'Paper', shape: 'Rectangular', visibleMark: 'Coffee ring on the cover' }
    }, {
      userId: securityTech.id, daysAgo: 7.6, location: 'Hyderabad Cafeteria',
      description: 'Found a plain black A5 notebook with a coffee ring on the cover on a cafeteria table.',
      profile: { itemName: 'Black A5 Notebook', category: 'Stationery', primaryColor: 'Black', material: 'Paper', shape: 'Rectangular', visibleMark: 'Coffee ring on the cover' }
    })
  ]);

  // City Hospital — a second patient-property case.
  const [[hospLostPhone, hospFoundPhone]] = await Promise.all([
    extra(hospital.id, {
      userId: patientHospital.id, daysAgo: 2.4, location: 'Day Care Waiting Area',
      description: 'Lost my phone in a clear protective case with a chipped corner at the bottom, in the day care waiting area.',
      profile: { itemName: 'Phone in Clear Case', category: 'Electronics', primaryColor: 'Clear', material: 'Plastic', shape: 'Rectangular', visibleMark: 'Chipped corner at the bottom' }
    }, {
      userId: securityHospital.id, daysAgo: 2.1, location: 'Day Care Waiting Area',
      description: 'Found a phone in a clear protective case with a chipped bottom corner on a chair in the day care waiting area.',
      profile: { itemName: 'Phone in Clear Case', category: 'Electronics', primaryColor: 'Clear', material: 'Plastic', shape: 'Rectangular', visibleMark: 'Chipped corner at the bottom' }
    })
  ]);

  /* ---------------- recovery board: 10 detailed items per organization ---------------- */
  // The dataset the recovery/claims screens are judged on: ten real objects per
  // organization, each filed twice (lost by the owner, found by staff) with a
  // fully filled itemProfile, a description and its own artwork.
  //
  // The objects and their attributes are modelled on the sort of thing a school
  // and an office actually hand in (library water bottles, ID cards, track pants
  // after games, charger bricks left under desks). Detail-rich on purpose: brand,
  // material, size, serial and visible marks are exactly what the matcher scores,
  // so a blank profile would produce a demo that ranks candidates at random.
  // The lost copy of each pair belongs to a different member, so "My cases" and
  // the claim flow have real content whichever demo account is signed in.
  const SCHOOL_ITEMS = [
    {
      art: 'black-handbag',
      lost: {
        userId: studentAbc.id, daysAgo: 7.4, place: 'Central Library, Reading Room',
        text: 'Lost my black leather handbag on the reading-room table, with a silver clasp. It has my notebooks and a blue key tag inside.',
        p: { itemName: 'Black Handbag', category: 'Handbag', primaryColor: 'Black', secondaryColor: 'Silver', brand: 'Hidesign', model: 'Aurelia', material: 'Leather', shape: 'Rectangular', size: 'Medium', condition: 'Good', visibleMark: 'Silver clasp, blue key tag inside', estimatedValue: '4200' }
      },
      found: {
        userId: staffAbc.id, daysAgo: 7.1, place: 'Central Library, Reading Room',
        text: 'Handed in a black leather handbag with a silver clasp and a blue key tag inside, left under the reading-room table.',
        p: { itemName: 'Black Handbag', category: 'Handbag', primaryColor: 'Black', secondaryColor: 'Silver', brand: 'Hidesign', model: 'Aurelia', material: 'Leather', shape: 'Rectangular', size: 'Medium', condition: 'Good', visibleMark: 'Silver clasp, blue key tag inside', finderNotes: 'Held at the library counter', estimatedValue: '4200' }
      }
    },
    {
      art: 'blue-tablet',
      lost: {
        userId: studentAbc.id, daysAgo: 6.3, place: 'Academic Block, Room 3B',
        text: 'Left my blue Android tablet in a grey flip cover on the desk in Room 3B after the maths lecture. The cover has my roll number written on it in marker.',
        p: { itemName: 'Blue Tablet', category: 'Tablet', primaryColor: 'Blue', secondaryColor: 'Grey', brand: 'Samsung', model: 'Galaxy Tab A9+', material: 'Aluminium', shape: 'Rectangular', size: 'Medium', condition: 'Good', visibleMark: 'Roll number in marker on the cover', estimatedValue: '18000' }
      },
      found: {
        userId: securityAbc.id, daysAgo: 6.0, place: 'Academic Block, Room 3B',
        text: 'Found a blue tablet in a grey flip cover on a desk in Room 3B, with a roll number written on the cover in marker.',
        p: { itemName: 'Blue Tablet', category: 'Tablet', primaryColor: 'Blue', secondaryColor: 'Grey', brand: 'Samsung', model: 'Galaxy Tab A9+', material: 'Aluminium', shape: 'Rectangular', size: 'Medium', condition: 'Good', visibleMark: 'Roll number in marker on the cover', finderNotes: 'Screen locked', estimatedValue: '18000' }
      }
    },
    {
      art: 'silver-watch',
      lost: {
        userId: staffAbc.id, daysAgo: 5.7, place: 'Sports Complex, Changing Room',
        text: 'Lost my silver chronograph wristwatch with a green dial in the sports complex changing room. The clasp is scratched from a fall.',
        p: { itemName: 'Silver Watch', category: 'Watch', primaryColor: 'Silver', secondaryColor: 'Green', brand: 'Titan', model: 'Neo Chrono', material: 'Stainless Steel', shape: 'Round', size: 'Small', condition: 'Fair', visibleMark: 'Green dial, scratched clasp', estimatedValue: '9500' }
      },
      found: {
        userId: securityAbc.id, daysAgo: 5.4, place: 'Sports Complex, Changing Room',
        text: 'A silver watch with a green dial was handed to the desk after a practice session; the clasp is scratched.',
        p: { itemName: 'Silver Watch', category: 'Watch', primaryColor: 'Silver', secondaryColor: 'Green', brand: 'Titan', model: 'Neo Chrono', material: 'Stainless Steel', shape: 'Round', size: 'Small', condition: 'Fair', visibleMark: 'Green dial, scratched clasp', finderNotes: 'Found on the changing-room locker bench', estimatedValue: '9500' }
      }
    },
    {
      art: 'black-headphones',
      lost: {
        userId: staffAbc.id, daysAgo: 5.1, place: 'Music Room (Block C)',
        text: 'Left my black over-ear headphones in the music room. The brand is boAt and there is a speck of white paint on the right earcup.',
        p: { itemName: 'Black Headphones', category: 'Headphones', primaryColor: 'Black', secondaryColor: 'Red', brand: 'boAt', model: 'Rockerz 550', material: 'Plastic', shape: 'Circular', size: 'Large', condition: 'Good', visibleMark: 'White paint speck on the right earcup', estimatedValue: '2500' }
      },
      found: {
        userId: securityAbc.id, daysAgo: 4.8, place: 'Music Room (Block C)',
        text: 'Found black boAt over-ear headphones with a white paint speck on the right earcup, left on a chair in the music room.',
        p: { itemName: 'Black Headphones', category: 'Headphones', primaryColor: 'Black', secondaryColor: 'Red', brand: 'boAt', model: 'Rockerz 550', material: 'Plastic', shape: 'Circular', size: 'Large', condition: 'Good', visibleMark: 'White paint speck on the right earcup', finderNotes: 'Padded case missing', estimatedValue: '2500' }
      }
    },
    {
      art: 'black-sunglasses',
      lost: {
        userId: studentAbc.id, daysAgo: 4.4, place: 'Canteen, First Floor',
        text: 'Lost my black wayfarer sunglasses in the first-floor canteen; the lenses are grey gradient and the right arm folds loosely.',
        p: { itemName: 'Black Sunglasses', category: 'Glasses', primaryColor: 'Black', secondaryColor: 'Grey', brand: 'Fastrack', model: 'Wayfarer', material: 'Polycarbonate', shape: 'Rectangular', size: 'Small', condition: 'Good', visibleMark: 'Loose right arm, grey gradient lenses', estimatedValue: '1500' }
      },
      found: {
        userId: staffAbc.id, daysAgo: 4.1, place: 'Canteen, First Floor',
        text: 'Found black wayfarer sunglasses with grey gradient lenses on a canteen table; the right arm folds loosely.',
        p: { itemName: 'Black Sunglasses', category: 'Glasses', primaryColor: 'Black', secondaryColor: 'Grey', brand: 'Fastrack', model: 'Wayfarer', material: 'Polycarbonate', shape: 'Rectangular', size: 'Small', condition: 'Good', visibleMark: 'Loose right arm, grey gradient lenses', estimatedValue: '1500' }
      }
    },
    {
      art: 'teal-water-bottle',
      lost: {
        userId: studentAbc.id, daysAgo: 3.8, place: 'Basketball Court',
        text: 'Lost my teal stainless steel water bottle beside the basketball court. Some paint has peeled off near the base and the cap has a small dent.',
        p: { itemName: 'Teal Water Bottle', category: 'Water Bottle', primaryColor: 'Teal', secondaryColor: 'White', brand: 'Milton', model: 'Thermosteel 750', material: 'Stainless Steel', shape: 'Tall', size: 'Medium', condition: 'Fair', visibleMark: 'Peeled paint near the base, dented cap', estimatedValue: '900' }
      },
      found: {
        userId: securityAbc.id, daysAgo: 3.5, place: 'Basketball Court',
        text: 'Found a teal stainless steel water bottle beside the basketball court, with paint peeled near the base and a dented cap.',
        p: { itemName: 'Teal Water Bottle', category: 'Water Bottle', primaryColor: 'Teal', secondaryColor: 'White', brand: 'Milton', model: 'Thermosteel 750', material: 'Stainless Steel', shape: 'Tall', size: 'Medium', condition: 'Fair', visibleMark: 'Peeled paint near the base, dented cap', estimatedValue: '900' }
      }
    },
    {
      art: 'navy-track-pants',
      lost: {
        userId: studentAbc.id, daysAgo: 3.2, place: 'Sports Complex, Changing Room',
        text: 'Left my navy track pants in the changing room after athletics practice. There is a white stripe down each side and a small tear at the back pocket.',
        p: { itemName: 'Navy Track Pants', category: 'Clothing', primaryColor: 'Navy', secondaryColor: 'White', brand: 'Nike', model: 'Dri-FIT Academy', material: 'Polyester', shape: 'Long', size: 'M', condition: 'Good', visibleMark: 'Small tear at the back pocket', estimatedValue: '2200' }
      },
      found: {
        userId: staffAbc.id, daysAgo: 2.9, place: 'Sports Complex, Changing Room',
        text: 'Found navy track pants with a white stripe down each side and a small tear at the back pocket, folded on a changing-room bench.',
        p: { itemName: 'Navy Track Pants', category: 'Clothing', primaryColor: 'Navy', secondaryColor: 'White', brand: 'Nike', model: 'Dri-FIT Academy', material: 'Polyester', shape: 'Long', size: 'M', condition: 'Good', visibleMark: 'Small tear at the back pocket', estimatedValue: '2200' }
      }
    },
    {
      art: 'silver-laptop-stand',
      lost: {
        userId: staffAbc.id, daysAgo: 2.7, place: 'Computer Lab 1',
        text: 'Lost my silver aluminium laptop stand in Computer Lab 1. The black rubber pad is missing from its left foot.',
        p: { itemName: 'Silver Laptop Stand', category: 'Laptop', primaryColor: 'Silver', secondaryColor: 'Grey', brand: 'Amazon Basics', model: 'Aluminium Riser', material: 'Aluminium', shape: 'Rectangular', size: 'Medium', condition: 'Good', visibleMark: 'Missing rubber pad on the left foot', estimatedValue: '1600' }
      },
      found: {
        userId: securityAbc.id, daysAgo: 2.4, place: 'Computer Lab 1',
        text: 'Found a silver aluminium laptop stand in Computer Lab 1 with the left rubber foot pad missing.',
        p: { itemName: 'Silver Laptop Stand', category: 'Laptop', primaryColor: 'Silver', secondaryColor: 'Grey', brand: 'Amazon Basics', model: 'Aluminium Riser', material: 'Aluminium', shape: 'Rectangular', size: 'Medium', condition: 'Good', visibleMark: 'Missing rubber pad on the left foot', estimatedValue: '1600' }
      }
    },
    {
      art: 'grey-wireless-mouse',
      lost: {
        userId: studentAbc.id, daysAgo: 2.2, place: 'Central Library, 2nd Floor',
        text: 'Lost my grey wireless mouse with a blue scroll wheel on the second floor of the library. The USB receiver is still in my locker.',
        p: { itemName: 'Grey Wireless Mouse', category: 'Electronics', primaryColor: 'Grey', secondaryColor: 'Blue', brand: 'Logitech', model: 'M331 Silent', material: 'Plastic', shape: 'Small', size: 'Small', condition: 'Good', visibleMark: 'Blue scroll wheel', serialNumber: 'LZ-M331-884210', estimatedValue: '1300' }
      },
      found: {
        userId: staffAbc.id, daysAgo: 1.9, place: 'Central Library, 2nd Floor',
        text: 'Found a grey Logitech wireless mouse with a blue scroll wheel on a library table on the second floor.',
        p: { itemName: 'Grey Wireless Mouse', category: 'Electronics', primaryColor: 'Grey', secondaryColor: 'Blue', brand: 'Logitech', model: 'M331 Silent', material: 'Plastic', shape: 'Small', size: 'Small', condition: 'Good', visibleMark: 'Blue scroll wheel', serialNumber: 'LZ-M331-884210', estimatedValue: '1300' }
      }
    },
    {
      art: 'student-id-card',
      lost: {
        userId: studentAbc.id, daysAgo: 1.7, place: 'School Bus Stop, Gate 2',
        text: 'Dropped my blue student ID card near the Gate 2 bus stop. It hangs from a yellow lanyard and the library barcode is on the back.',
        p: { itemName: 'Student ID Card', category: 'ID Card', primaryColor: 'Blue', secondaryColor: 'Yellow', brand: 'ABC School', model: 'Student Card 2026', material: 'Plastic', shape: 'Small', size: 'Small', condition: 'Good', visibleMark: 'Yellow lanyard, library barcode on the back', estimatedValue: '300' }
      },
      found: {
        userId: securityAbc.id, daysAgo: 1.4, place: 'School Bus Stop, Gate 2',
        text: 'A blue student ID card on a yellow lanyard was handed to the security desk after being found near the Gate 2 bus stop.',
        p: { itemName: 'Student ID Card', category: 'ID Card', primaryColor: 'Blue', secondaryColor: 'Yellow', brand: 'ABC School', model: 'Student Card 2026', material: 'Plastic', shape: 'Small', size: 'Small', condition: 'Good', visibleMark: 'Yellow lanyard, library barcode on the back', finderNotes: 'Held at the security desk', estimatedValue: '300' }
      }
    }
  ];

  // One helper files the pair, so the lost and the found copy of an item can never
  // drift apart in category or artwork. Returns [lostReport, foundReport].
  const filePair = (orgId, spec) => Promise.all([
    store.createReport({
      organizationId: orgId, userId: spec.lost.userId, type: 'LOST',
      itemProfile: profile(spec.lost.p), images: art(spec.art), description: spec.lost.text,
      category: spec.lost.p.category, location: spec.lost.place,
      lostAt: daysAgo(spec.lost.daysAgo), status: 'POTENTIAL_MATCH'
    }),
    store.createReport({
      organizationId: orgId, userId: spec.found.userId, type: 'FOUND',
      itemProfile: profile(spec.found.p), images: art(spec.art), description: spec.found.text,
      category: spec.found.p.category, location: spec.found.place,
      foundAt: daysAgo(spec.found.daysAgo), status: 'MATCHED'
    })
  ]);

  const schoolPairs = await Promise.all(SCHOOL_ITEMS.map((spec) => filePair(abc.id, spec)));
  const [schoolHandbag, schoolTablet, schoolWatch, schoolHeadphones, schoolSunglasses,
    schoolBottle, schoolTrackPants, schoolLaptopStand, schoolMouse, schoolIdCard] = schoolPairs;

  /* ---------------- recovery board (XYZ Company) ---------------- */
  // The same ten-slot board for the office tenant, so switching organizations in
  // the demo never lands on an empty recovery screen. Maya Chen files the lost
  // side and the office admin/facilities account files the found side, which is
  // exactly how the two roles behave in the real app.
  const COMPANY_ITEMS = [
    {
      art: 'black-notebook',
      lost: {
        userId: employeeXyz.id, daysAgo: 8.2, place: 'Head Office, Meeting Room 3',
        text: 'Left my black A5 spiral notebook in Meeting Room 3 after the sprint review. It has a grey elastic band and the last three pages are torn out.',
        p: { itemName: 'Black Notebook', category: 'Stationery', primaryColor: 'Black', secondaryColor: 'Blue', brand: 'Classmate', model: 'A5 Spiral', material: 'Paper', shape: 'Rectangular', size: 'Small', condition: 'Good', visibleMark: 'Grey elastic band, three pages torn out', estimatedValue: '250' }
      },
      found: {
        userId: adminXyz.id, daysAgo: 7.9, place: 'Head Office, Meeting Room 3',
        text: 'Found a black A5 spiral notebook with a grey elastic band and the last three pages torn out, left in Meeting Room 3.',
        p: { itemName: 'Black Notebook', category: 'Stationery', primaryColor: 'Black', secondaryColor: 'Blue', brand: 'Classmate', model: 'A5 Spiral', material: 'Paper', shape: 'Rectangular', size: 'Small', condition: 'Good', visibleMark: 'Grey elastic band, three pages torn out', finderNotes: 'Kept at the front office', estimatedValue: '250' }
      }
    },
    {
      art: 'green-umbrella',
      lost: {
        userId: employeeXyz.id, daysAgo: 7.1, place: 'Head Office, Main Lobby',
        text: 'Left my green umbrella with a wooden handle and a white trim near the main lobby sofa after the rain on Tuesday.',
        p: { itemName: 'Green Umbrella', category: 'Umbrella', primaryColor: 'Green', secondaryColor: 'White', brand: 'Popy', model: 'Stormshield Compact', material: 'Polyester', shape: 'Long', size: 'Medium', condition: 'Good', visibleMark: 'Wooden handle, white trim on the edge', estimatedValue: '800' }
      },
      found: {
        userId: adminXyz.id, daysAgo: 6.8, place: 'Head Office, Main Lobby',
        text: 'A green umbrella with a wooden handle and a white trim was handed to the front office after being left in the lobby.',
        p: { itemName: 'Green Umbrella', category: 'Umbrella', primaryColor: 'Green', secondaryColor: 'White', brand: 'Popy', model: 'Stormshield Compact', material: 'Polyester', shape: 'Long', size: 'Medium', condition: 'Good', visibleMark: 'Wooden handle, white trim on the edge', finderNotes: 'Hung on the lobby umbrella stand', estimatedValue: '800' }
      }
    },
    {
      art: 'white-charger-brick',
      lost: {
        userId: employeeXyz.id, daysAgo: 6.2, place: 'Head Office, Desk 4-118',
        text: 'Lost my white 65W USB-C charger brick with a braided cable under my desk. It has a small chip on the top edge.',
        p: { itemName: 'White Charger Brick', category: 'Charger', primaryColor: 'White', secondaryColor: 'Grey', brand: 'Anker', model: 'Nano II 65W', material: 'Plastic', shape: 'Small', size: 'Small', condition: 'Good', visibleMark: 'Small chip on the top edge', serialNumber: 'AK-65W-2207', estimatedValue: '3500' }
      },
      found: {
        userId: adminXyz.id, daysAgo: 5.9, place: 'Head Office, Desk 4-118',
        text: 'Found a white Anker 65W USB-C charger brick with a braided cable under desk 4-118; the top edge has a small chip.',
        p: { itemName: 'White Charger Brick', category: 'Charger', primaryColor: 'White', secondaryColor: 'Grey', brand: 'Anker', model: 'Nano II 65W', material: 'Plastic', shape: 'Small', size: 'Small', condition: 'Good', visibleMark: 'Small chip on the top edge', serialNumber: 'AK-65W-2207', estimatedValue: '3500' }
      }
    },
    {
      art: 'brown-sunglasses',
      lost: {
        userId: employeeXyz.id, daysAgo: 5.3, place: 'Head Office, Terrace Cafeteria',
        text: 'Lost my brown tortoiseshell sunglasses with beige arms on the terrace cafeteria table. The left lens has a light scratch.',
        p: { itemName: 'Brown Sunglasses', category: 'Glasses', primaryColor: 'Brown', secondaryColor: 'Beige', brand: 'Ray-Ban', model: 'Clubmaster', material: 'Acetate', shape: 'Round', size: 'Small', condition: 'Fair', visibleMark: 'Light scratch on the left lens', estimatedValue: '7500' }
      },
      found: {
        userId: adminXyz.id, daysAgo: 5.0, place: 'Head Office, Terrace Cafeteria',
        text: 'Found brown tortoiseshell sunglasses with beige arms on a terrace cafeteria table; there is a light scratch on the left lens.',
        p: { itemName: 'Brown Sunglasses', category: 'Glasses', primaryColor: 'Brown', secondaryColor: 'Beige', brand: 'Ray-Ban', model: 'Clubmaster', material: 'Acetate', shape: 'Round', size: 'Small', condition: 'Fair', visibleMark: 'Light scratch on the left lens', estimatedValue: '7500' }
      }
    },
    {
      art: 'orange-mug',
      lost: {
        userId: employeeXyz.id, daysAgo: 4.6, place: 'Head Office, Pantry, 4th Floor',
        text: 'Left my orange ceramic coffee mug in the fourth-floor pantry. It has a chipped rim and a white band around the middle.',
        p: { itemName: 'Orange Coffee Mug', category: 'Personal', primaryColor: 'Orange', secondaryColor: 'White', brand: 'Clay Craft', model: 'Everyday 350ml', material: 'Ceramic', shape: 'Round', size: 'Small', condition: 'Fair', visibleMark: 'Chipped rim, white band around the middle', estimatedValue: '400' }
      },
      found: {
        userId: adminXyz.id, daysAgo: 4.3, place: 'Head Office, Pantry, 4th Floor',
        text: 'An orange ceramic mug with a chipped rim and a white band was left in the fourth-floor pantry and moved to the front office.',
        p: { itemName: 'Orange Coffee Mug', category: 'Personal', primaryColor: 'Orange', secondaryColor: 'White', brand: 'Clay Craft', model: 'Everyday 350ml', material: 'Ceramic', shape: 'Round', size: 'Small', condition: 'Fair', visibleMark: 'Chipped rim, white band around the middle', estimatedValue: '400' }
      }
    },
    {
      art: 'red-hoodie',
      lost: {
        userId: employeeXyz.id, daysAgo: 4.0, place: 'Head Office, 2nd Floor Chill Zone',
        text: 'Left my red zip-up hoodie on the chill-zone sofa on the second floor. The left cuff has a repaired stitch and the pull tab is missing.',
        p: { itemName: 'Red Hoodie', category: 'Clothing', primaryColor: 'Red', secondaryColor: 'White', brand: 'H&M', model: 'Zip Hoodie', material: 'Cotton', shape: 'Long', size: 'L', condition: 'Good', visibleMark: 'Repaired stitch on the left cuff, missing zip pull', estimatedValue: '2400' }
      },
      found: {
        userId: adminXyz.id, daysAgo: 3.7, place: 'Head Office, 2nd Floor Chill Zone',
        text: 'Found a red zip-up hoodie on the second-floor chill-zone sofa with a repaired left cuff and no zip pull tab.',
        p: { itemName: 'Red Hoodie', category: 'Clothing', primaryColor: 'Red', secondaryColor: 'White', brand: 'H&M', model: 'Zip Hoodie', material: 'Cotton', shape: 'Long', size: 'L', condition: 'Good', visibleMark: 'Repaired stitch on the left cuff, missing zip pull', estimatedValue: '2400' }
      }
    },
    {
      art: 'black-earbuds',
      lost: {
        userId: employeeXyz.id, daysAgo: 3.3, place: 'Head Office, Gym Changing Room',
        text: 'Lost my black wireless earbuds case in the office gym changing room. The case has a blue rubber band around it and one earbud has lost its tip.',
        p: { itemName: 'Black Earbuds', category: 'Headphones', primaryColor: 'Black', secondaryColor: 'Blue', brand: 'OnePlus', model: 'Buds Z2', material: 'Plastic', shape: 'Small', size: 'Small', condition: 'Good', visibleMark: 'Blue rubber band around the case, one tip missing', estimatedValue: '2800' }
      },
      found: {
        userId: adminXyz.id, daysAgo: 3.0, place: 'Head Office, Gym Changing Room',
        text: 'A black earbuds case with a blue rubber band around it was found in the gym changing room; one earbud tip is missing.',
        p: { itemName: 'Black Earbuds', category: 'Headphones', primaryColor: 'Black', secondaryColor: 'Blue', brand: 'OnePlus', model: 'Buds Z2', material: 'Plastic', shape: 'Small', size: 'Small', condition: 'Good', visibleMark: 'Blue rubber band around the case, one tip missing', estimatedValue: '2800' }
      }
    },
    {
      art: 'leather-notebook',
      lost: {
        userId: employeeXyz.id, daysAgo: 2.6, place: 'Head Office, Meeting Room 1',
        text: 'Left my brown leather notebook in Meeting Room 1. It is refillable, closes with a tan cord and my initials are embossed on the front.',
        p: { itemName: 'Leather Notebook', category: 'Stationery', primaryColor: 'Brown', secondaryColor: 'Tan', brand: 'DailyObjects', model: 'Refillable A5', material: 'Leather', shape: 'Rectangular', size: 'Small', condition: 'Good', visibleMark: 'Initials embossed on the front, tan cord', estimatedValue: '1900' }
      },
      found: {
        userId: adminXyz.id, daysAgo: 2.3, place: 'Head Office, Meeting Room 1',
        text: 'Found a brown leather refillable notebook in Meeting Room 1 with initials embossed on the front and a tan closing cord.',
        p: { itemName: 'Leather Notebook', category: 'Stationery', primaryColor: 'Brown', secondaryColor: 'Tan', brand: 'DailyObjects', model: 'Refillable A5', material: 'Leather', shape: 'Rectangular', size: 'Small', condition: 'Good', visibleMark: 'Initials embossed on the front, tan cord', estimatedValue: '1900' }
      }
    },
    {
      art: 'black-phone-pouch',
      lost: {
        userId: employeeXyz.id, daysAgo: 2.0, place: 'Head Office, Reception Sofa',
        text: 'Lost my black phone pouch with a green zip line on the reception sofa. The shoulder strap is detachable and slightly frayed.',
        p: { itemName: 'Black Phone Pouch', category: 'Personal', primaryColor: 'Black', secondaryColor: 'Green', brand: 'Wildcraft', model: 'Utility Sling', material: 'Nylon', shape: 'Small', size: 'Small', condition: 'Fair', visibleMark: 'Green zip line, frayed detachable strap', estimatedValue: '1100' }
      },
      found: {
        userId: adminXyz.id, daysAgo: 1.7, place: 'Head Office, Reception Sofa',
        text: 'Found a black phone pouch with a green zip line and a frayed detachable strap on the reception sofa.',
        p: { itemName: 'Black Phone Pouch', category: 'Personal', primaryColor: 'Black', secondaryColor: 'Green', brand: 'Wildcraft', model: 'Utility Sling', material: 'Nylon', shape: 'Small', size: 'Small', condition: 'Fair', visibleMark: 'Green zip line, frayed detachable strap', estimatedValue: '1100' }
      }
    },
    {
      art: 'white-laptop-charger',
      lost: {
        userId: employeeXyz.id, daysAgo: 1.5, place: 'Head Office, Hot Desk, 4th Floor',
        text: 'Left my white 45W laptop charger with a black tip on the fourth-floor hot desk. The cable has a small kink near the plug.',
        p: { itemName: 'White Laptop Charger', category: 'Charger', primaryColor: 'White', secondaryColor: 'Black', brand: 'Dell', model: '45W Type-C', material: 'Plastic', shape: 'Small', size: 'Small', condition: 'Good', visibleMark: 'Black tip, small kink near the plug', serialNumber: 'DL-45W-8819', estimatedValue: '3200' }
      },
      found: {
        userId: adminXyz.id, daysAgo: 1.2, place: 'Head Office, Hot Desk, 4th Floor',
        text: 'Found a white Dell 45W laptop charger with a black tip and a small kink near the plug on the fourth-floor hot desk.',
        p: { itemName: 'White Laptop Charger', category: 'Charger', primaryColor: 'White', secondaryColor: 'Black', brand: 'Dell', model: '45W Type-C', material: 'Plastic', shape: 'Small', size: 'Small', condition: 'Good', visibleMark: 'Black tip, small kink near the plug', serialNumber: 'DL-45W-8819', estimatedValue: '3200' }
      }
    }
  ];

  const companyPairs = await Promise.all(COMPANY_ITEMS.map((spec) => filePair(xyz.id, spec)));
  const [companyNotebook, companyUmbrella, companyCharger, companySunglasses, companyMug,
    companyHoodie, companyEarbuds, companyLeatherNotebook, companyPhonePouch, companyLaptopCharger] = companyPairs;

  /* ---------------- reports (Hackathon 2026) ---------------- */
  const lostBadgeHack = await store.createReport({
    organizationId: hack.id, userId: hackerHack.id, type: 'LOST',
    itemProfile: profile({ itemName: 'Laptop Sticker Pack', category: 'Electronics', primaryColor: 'Black', material: 'Vinyl', shape: 'Small', visibleMark: 'Half of a circuit-board design' }),
    images: art('laptop-sticker-pack'), description: 'Left a black laptop sticker pack showing half a circuit-board design on the hackathon desk in the main hall.',
    category: 'Electronics', location: 'Main Hall, Table 12', lostAt: daysAgo(0.6), status: 'POTENTIAL_MATCH'
  });

  const foundBadgeHack = await store.createReport({
    organizationId: hack.id, userId: mentorHack.id, type: 'FOUND',
    itemProfile: profile({ itemName: 'Laptop Sticker Pack', category: 'Electronics', primaryColor: 'Black', material: 'Vinyl', shape: 'Small', visibleMark: 'Half of a circuit-board design' }),
    images: art('laptop-sticker-pack'), description: 'Picked up a black laptop sticker pack showing half a circuit-board design from table 12 in the main hall.',
    category: 'Electronics', location: 'Main Hall, Table 12', foundAt: daysAgo(0.5), status: 'MATCHED'
  });

  /* ---------------- matches ---------------- */
  const mkMatch = (lost, found) => {
    const result = matching.scorePair(lost, found);
    return store.createMatch({
      organizationId: lost.organizationId,
      lostReportId: lost.id, foundReportId: found.id,
      ...result,
      status: result.finalScore >= 85 ? 'PENDING_VERIFICATION' : 'MANUAL_REVIEW',
      notified: true
    });
  };

  const matchBackpack = await mkMatch(lostBackpack, foundBackpack);
  const matchAdminLaptop = await mkMatch(lostAdminLaptop, foundAdminLaptop);
  const matchAdminBadge = await mkMatch(lostAdminBadge, foundAdminBadge);
  const matchFlask = await mkMatch(lostFlask, foundFlask);
  const matchUmbrella = await mkMatch(lostUmbrella, foundUmbrella);
  const matchKeyboardTech = await mkMatch(lostLaptopTech, foundLaptopTech);
  const matchBadgeTech = await mkMatch(lostBadgeTech, foundBadgeTech);
  const matchWalletHospital = await mkMatch(lostWalletHospital, foundWalletHospital);
  const matchBadgeHack = await mkMatch(lostBadgeHack, foundBadgeHack);
  const matchGlassesAbc = await mkMatch(abcLostGlasses, abcFoundGlasses);
  const matchShoesAbc = await mkMatch(abcLostShoes, abcFoundShoes);
  const matchChargerTech = await mkMatch(techLostCharger, techFoundCharger);
  const matchNotebookTech = await mkMatch(techLostNotebook, techFoundNotebook);
  const matchPhoneHospital = await mkMatch(hospLostPhone, hospFoundPhone);

  // One candidate that has already been worked through, so the "decided" lane
  // and the audit trail on the review screen both have content.
  await store.updateMatch(matchShoesAbc.id, {
    status: 'REJECTED', reviewedBy: securityAbc.id, reviewedAt: daysAgo(5.5),
    reviewNotes: 'Different size — the found shoe is a right foot, the lost one was the left.'
  });

  /* ---------------- matches (recovery board) ---------------- */
  // The recovery-board pairs, plus the verification/return state each one is in.
  // Every pair is a genuine near-identical filing (same item, same place, within
  // a few hours), so the score really is high — the demo is not faking certainty,
  // it is showing what two honest accounts of one object look like.
  //
  //   pending  → nobody has claimed it yet; the item sits on the status board
  //   ready    → ownership verified, one-time QR issued, waiting at the desk
  //   done     → the whole loop closed: verified, released, RETURNED
  const RECOVERY_BOARD = [
    { lost: schoolHandbag[0], found: schoolHandbag[1], state: 'pending', days: 7.3 },
    { lost: schoolTablet[0], found: schoolTablet[1], state: 'ready', claimant: studentAbc, days: 6.1, otp: '615204' },
    { lost: schoolWatch[0], found: schoolWatch[1], state: 'done', claimant: staffAbc, days: 5.6, otp: '208417' },
    { lost: schoolHeadphones[0], found: schoolHeadphones[1], state: 'ready', claimant: staffAbc, days: 4.9, otp: '551038' },
    { lost: schoolSunglasses[0], found: schoolSunglasses[1], state: 'pending', days: 4.2 },
    { lost: schoolBottle[0], found: schoolBottle[1], state: 'done', claimant: studentAbc, days: 3.7, otp: '937261' },
    { lost: schoolTrackPants[0], found: schoolTrackPants[1], state: 'pending', days: 3.1 },
    { lost: schoolLaptopStand[0], found: schoolLaptopStand[1], state: 'ready', claimant: staffAbc, days: 2.6, otp: '402875' },
    { lost: schoolMouse[0], found: schoolMouse[1], state: 'pending', days: 2.1 },
    { lost: schoolIdCard[0], found: schoolIdCard[1], state: 'pending', days: 1.6 },

    { lost: companyNotebook[0], found: companyNotebook[1], state: 'done', claimant: employeeXyz, days: 8.0, otp: '730419' },
    { lost: companyUmbrella[0], found: companyUmbrella[1], state: 'ready', claimant: employeeXyz, days: 6.9, otp: '184563' },
    { lost: companyCharger[0], found: companyCharger[1], state: 'pending', days: 6.0 },
    { lost: companySunglasses[0], found: companySunglasses[1], state: 'pending', days: 5.2 },
    { lost: companyMug[0], found: companyMug[1], state: 'done', claimant: employeeXyz, days: 4.5, otp: '629340' },
    { lost: companyHoodie[0], found: companyHoodie[1], state: 'pending', days: 3.9 },
    { lost: companyEarbuds[0], found: companyEarbuds[1], state: 'ready', claimant: employeeXyz, days: 3.2, otp: '813057' },
    { lost: companyLeatherNotebook[0], found: companyLeatherNotebook[1], state: 'pending', days: 2.5 },
    { lost: companyPhonePouch[0], found: companyPhonePouch[1], state: 'pending', days: 1.9 },
    { lost: companyLaptopCharger[0], found: companyLaptopCharger[1], state: 'done', claimant: employeeXyz, days: 1.4, otp: '370928' }
  ];

  const boardMatches = await Promise.all(RECOVERY_BOARD.map(async (row) => {
    const match = await mkMatch(row.lost, row.found);
    await store.updateMatch(match.id, {
      status: row.state === 'pending' ? 'MANUAL_REVIEW' : 'VERIFIED',
      reviewNotes: row.state === 'pending'
        ? 'Same item, same place, minutes apart — waiting for the owner to claim it.'
        : 'Ownership confirmed against the sealed details.'
    });
    return { ...row, match };
  }));

  const boardState = boardMatches.map((row, i) => {
    const school = i < SCHOOL_ITEMS.length;
    const slug = (school ? SCHOOL_ITEMS[i] : COMPANY_ITEMS[i - SCHOOL_ITEMS.length]).art;
    const ready = row.state === 'ready';
    return {
      ...row,
      index: i,
      school,
      orgId: school ? abc.id : xyz.id,
      slug,
      returnStatus: ready ? 'READY' : 'COMPLETED',
      qrToken: `seed-${slug}-token-${String(1000 + i)}`,
      qrExpiresAt: ready ? new Date(Date.now() + 45 * 60000) : daysAgo(-1),
      usedAt: ready ? null : daysAgo(Math.max(row.days - 0.4, 0.2)),
      instructions: school
        ? 'Present the one-time QR at the Security Desk and confirm your identity.'
        : 'Collect from the Front Office with your QR code and handover OTP.'
    };
  });

  /* ---------------- verifications (recovery board) ---------------- */
  // A claim only exists once the owner has proved ownership, so the "ready" and
  // "done" items carry a VERIFIED verification and the untouched ones carry none
  // — which is exactly how the claim screen reads: prove it, then collect it.
  const boardVerifications = await Promise.all(boardState
    .filter((row) => row.state !== 'pending')
    .map((row) => {
      const challenge = verificationService.buildChallenge(row.lost);
      return store.createVerification({
        organizationId: row.orgId, matchId: row.match.id, reportId: row.lost.id,
        claimantUserId: row.claimant.id,
        challenge, expectedEvidence: { expected: challenge.expected, key: challenge.key },
        status: 'VERIFIED', attempts: 1, verificationScore: 100,
        reviewedBy: row.school ? securityAbc.id : adminXyz.id,
        reviewedAt: daysAgo(Math.max(row.days - 0.3, 0.2)),
        reviewNotes: 'Ownership questions answered correctly.'
      });
    }));
  const verifByReport = new Map(boardVerifications.map((v) => [v.reportId, v]));

  /* ---------------- returns (recovery board) ---------------- */
  // The QR + handover code for every claimed item. "ready" ones are still open
  // (a live token, waiting at the desk); "done" ones are closed and the report
  // moves to RETURNED, so the item really is gone from the open-case board.
  const boardReturns = await Promise.all(boardState
    .filter((row) => row.state !== 'pending')
    .map((row) => store.createReturn({
      organizationId: row.orgId, reportId: row.lost.id,
      verifiedUserId: row.claimant.id, handoverStaffId: row.school ? securityAbc.id : adminXyz.id,
      qrToken: row.qrToken, qrExpiresAt: row.qrExpiresAt, usedAt: row.usedAt,
      otp: row.otp, pickupLocation: row.school ? 'Security Desk' : 'Front Office',
      instructions: row.instructions, status: row.returnStatus,
      timestamps: {
        reported: row.lost.createdAt,
        matched: row.match.createdAt,
        verified: daysAgo(Math.max(row.days - 0.3, 0.2)),
        authorized: daysAgo(Math.max(row.days - 0.2, 0.15)),
        ready: daysAgo(Math.max(row.days - 0.1, 0.1)),
        ...(row.returnStatus === 'COMPLETED' ? { completed: row.usedAt } : {})
      }
    })));
  const returnByReport = new Map(boardReturns.map((r) => [r.reportId, r]));

  for (const row of boardState) {
    if (row.state === 'pending') continue;
    // eslint-disable-next-line no-await-in-loop
    await store.updateReport(row.lost.id, { status: row.state === 'done' ? 'RETURNED' : 'RETURN_READY' });
    // eslint-disable-next-line no-await-in-loop
    await store.updateReport(row.found.id, { status: row.state === 'done' ? 'RETURNED' : 'MATCHED' });
  }

  /* ---------------- chain of custody (recovery board) ---------------- */
  // Every claimed item has a real ledger: found → logged at the desk, then for the
  // closed cases stored and released to the owner. The desk is the staff member
  // who actually filed the found report, so the "actor" column is never anonymous.
  for (const row of boardState) {
    if (row.state === 'pending') continue;
    const desk = row.school ? 'Security Desk' : 'Front Office';
    const holderName = row.school ? 'Grace Fernandes' : 'Ravi Iyer';
    const releaserName = row.school ? 'Rohan Kulkarni' : 'Ravi Iyer';
    const claimerName = row.claimant.name;
    // eslint-disable-next-line no-await-in-loop
    await custody({
      organizationId: row.orgId, reportId: row.lost.id, matchId: row.match.id,
      returnId: returnByReport.get(row.lost.id).id, event: 'LOGGED',
      toCustodian: desk, location: row.found.location,
      note: `${row.found.itemProfile.itemName} handed in and tagged for storage.`,
      actorUserId: row.found.userId, actorName: holderName, occurredAt: daysAgo(row.days - 0.1)
    });
    if (row.state !== 'done') continue;
    // eslint-disable-next-line no-await-in-loop
    await custody({
      organizationId: row.orgId, reportId: row.lost.id, matchId: row.match.id,
      returnId: returnByReport.get(row.lost.id).id, event: 'STORED',
      fromCustodian: desk, toCustodian: 'Lost property store',
      location: desk, note: 'Placed in the tagged store while the claim was verified.',
      actorUserId: row.found.userId, actorName: holderName, occurredAt: daysAgo(row.days - 0.25)
    });
    // eslint-disable-next-line no-await-in-loop
    // eslint-disable-next-line no-await-in-loop
    await custody({
      organizationId: row.orgId, reportId: row.lost.id, matchId: row.match.id,
      returnId: returnByReport.get(row.lost.id).id, event: 'RELEASED',
      fromCustodian: 'Lost property store', toCustodian: claimerName,
      location: desk, note: `Ownership verified; released against OTP ${row.otp}.`,
      actorUserId: row.school ? securityAbc.id : adminXyz.id, actorName: releaserName,
      occurredAt: daysAgo(row.days - 0.4)
    });
  }

  /* ---------------- verifications ---------------- */
  // The challenges below are built from each report's own sealed details.

  const backpackChallenge = verificationService.buildChallenge(lostBackpack);
  const verifBackpack = await store.createVerification({
    organizationId: abc.id, matchId: matchBackpack.id, reportId: lostBackpack.id, claimantUserId: studentAbc.id,
    challenge: backpackChallenge, expectedEvidence: { expected: backpackChallenge.expected, key: backpackChallenge.key },
    status: 'PENDING', attempts: 0
  });

  // A verification awaiting review in TechCorp, and one that was already
  // approved in the hospital, so the review queue is not uniformly empty.
  const keyboardChallenge = verificationService.buildChallenge(lostLaptopTech);
  const verifKeyboard = await store.createVerification({
    organizationId: tech.id, matchId: matchKeyboardTech.id, reportId: lostLaptopTech.id, claimantUserId: engineerTech.id,
    challenge: keyboardChallenge, expectedEvidence: { expected: keyboardChallenge.expected, key: keyboardChallenge.key },
    status: 'PENDING', attempts: 0
  });

  const walletChallenge = verificationService.buildChallenge(lostWalletHospital);
  const verifWallet = await store.createVerification({
    organizationId: hospital.id, matchId: matchWalletHospital.id, reportId: lostWalletHospital.id, claimantUserId: patientHospital.id,
    challenge: walletChallenge, expectedEvidence: { expected: walletChallenge.expected, key: walletChallenge.key },
    // VERIFIED, not APPROVED: that is the value the verification schema accepts
    // (PENDING | VERIFIED | REJECTED | REVIEW). The memory driver does not
    // enforce enums, so only a real MongoDB run catches a wrong value here.
    status: 'VERIFIED', attempts: 1, verificationScore: 100, reviewedBy: nurseHospital.id, reviewedAt: daysAgo(0.3)
  });

  const badgeChallenge = verificationService.buildChallenge(lostBadgeHack);
  const verifBadgeHack = await store.createVerification({
    organizationId: hack.id, matchId: matchBadgeHack.id, reportId: lostBadgeHack.id, claimantUserId: hackerHack.id,
    challenge: badgeChallenge, expectedEvidence: { expected: badgeChallenge.expected, key: badgeChallenge.key },
    // PENDING on purpose: the event org sets requireVerification:false, so this
    // one is optional and should read as a prompt, not a blocker.
    status: 'PENDING', attempts: 0
  });

  // XYZ closes the loop on its umbrella so that organization also shows a
  // verification, a return and a custody chain — no demo account should land on
  // an empty screen.
  // The ledger is append-only evidence, so entries are written oldest-first and
  // each hand-off names the holder it came from and the one it went to. The seed
  // is the one place that can lay down a truthful history in order.
  // (the `custody` writer itself is defined at the top of this module)

  const umbrellaChallenge = verificationService.buildChallenge(lostUmbrella);
  const verifUmbrella = await store.createVerification({
    organizationId: xyz.id, matchId: matchUmbrella.id, reportId: lostUmbrella.id, claimantUserId: employeeXyz.id,
    challenge: umbrellaChallenge, expectedEvidence: { expected: umbrellaChallenge.expected, key: umbrellaChallenge.key },
    status: 'VERIFIED', attempts: 1, verificationScore: 100, reviewedBy: adminXyz.id, reviewedAt: daysAgo(0.7)
  });

  const completedReturnXyz = await store.createReturn({
    organizationId: xyz.id, reportId: lostUmbrella.id, verifiedUserId: employeeXyz.id,
    qrToken: 'seed-umbrella-token-0005', qrExpiresAt: daysAgo(-1), usedAt: daysAgo(0.6),
    otp: '318472', handoverStaffId: adminXyz.id, pickupLocation: 'Front Office',
    instructions: 'Collect from the Front Office with your QR code.', status: 'COMPLETED',
    timestamps: { reported: lostUmbrella.createdAt, matched: matchUmbrella.createdAt, verified: daysAgo(0.8), authorized: daysAgo(0.7), ready: daysAgo(0.65), completed: daysAgo(0.6) }
  });
  // eslint-disable-next-line no-unused-vars
  const _doneXyz = completedReturnXyz;
  await store.updateReport(lostUmbrella.id, { status: 'RETURNED' });
  await store.updateReport(foundUmbrella.id, { status: 'RETURNED' });

  await custody({
    organizationId: xyz.id, reportId: lostUmbrella.id, matchId: matchUmbrella.id, returnId: completedReturnXyz.id,
    event: 'LOGGED', toCustodian: 'Front Office', location: 'Head Office, 4th Floor Reception',
    note: 'Umbrella handed in at the 4th-floor reception.', actorUserId: adminXyz.id, actorName: 'Ravi Iyer',
    occurredAt: daysAgo(0.9)
  });
  await custody({
    organizationId: xyz.id, reportId: lostUmbrella.id, matchId: matchUmbrella.id, returnId: completedReturnXyz.id,
    event: 'HANDED_OVER', fromCustodian: 'Front Office', toCustodian: 'Maya Chen',
    location: 'Front Office', note: 'Released after the ownership questions were answered correctly.',
    actorUserId: adminXyz.id, actorName: 'Ravi Iyer', occurredAt: daysAgo(0.6)
  });

  /* ---------------- returns ---------------- */
  // A completed return for the flask (fully closed loop) + a ready return for the laptop sleeve.
  const flaskReport = await store.findReportById(lostFlask.id);
  const completedReturn = await store.createReturn({
    organizationId: abc.id, reportId: lostFlask.id, verifiedUserId: studentAbc.id,
    qrToken: 'seed-flask-token-0001', qrExpiresAt: daysAgo(-1), usedAt: daysAgo(1),
    otp: '482913', handoverStaffId: securityAbc.id, pickupLocation: 'Security Desk',
    instructions: 'Collect from the Security Desk with your QR.', status: 'COMPLETED',
    timestamps: { reported: lostFlask.createdAt, matched: matchFlask.createdAt, verified: daysAgo(1.4), authorized: daysAgo(1.2), ready: daysAgo(1.1), completed: daysAgo(1) }
  });
  // eslint-disable-next-line no-unused-vars
  const _ = flaskReport;

  await store.updateReport(lostFlask.id, { status: 'RETURNED' });
  await store.updateReport(foundFlask.id, { status: 'RETURNED' });

  const readyReturn = await store.createReturn({
    organizationId: abc.id, reportId: lostLaptop.id, verifiedUserId: studentAbc.id,
    qrToken: 'seed-laptop-token-0002', qrExpiresAt: new Date(Date.now() + 15 * 60000),
    otp: '739204', handoverStaffId: securityAbc.id, pickupLocation: 'Security Desk',
    instructions: 'Present this QR at the Security Desk.', status: 'READY',
    timestamps: { reported: lostLaptop.createdAt, matched: daysAgo(3), verified: daysAgo(2), authorized: daysAgo(1), ready: daysAgo(1) }
  });
  await store.updateReport(lostLaptop.id, { status: 'RETURN_READY' });
  // eslint-disable-next-line no-unused-vars
  const _ready = readyReturn;

  // A READY return in TechCorp awaiting pickup, and a COMPLETED one in the
  // hospital so that org shows a closed loop rather than only open work.
  const readyReturnTech = await store.createReturn({
    organizationId: tech.id, reportId: lostLaptopTech.id, verifiedUserId: engineerTech.id,
    qrToken: 'seed-keyboard-token-0003', qrExpiresAt: new Date(Date.now() + 30 * 60000),
    otp: '552180', handoverStaffId: securityTech.id, pickupLocation: 'Facilities Desk, Lobby',
    instructions: 'Collect from the Facilities Desk with your QR code.', status: 'READY',
    timestamps: { reported: lostLaptopTech.createdAt, matched: matchKeyboardTech.createdAt, verified: daysAgo(0.9), authorized: daysAgo(0.6), ready: daysAgo(0.5) }
  });
  // eslint-disable-next-line no-unused-vars
  const _readyTech = readyReturnTech;

  const completedReturnHospital = await store.createReturn({
    organizationId: hospital.id, reportId: lostWalletHospital.id, verifiedUserId: patientHospital.id,
    qrToken: 'seed-wallet-token-0004', qrExpiresAt: daysAgo(-1), usedAt: daysAgo(0.3),
    otp: '904771', handoverStaffId: securityHospital.id, pickupLocation: 'Patient Relations Counter',
    instructions: 'Present your wristband and the handover code at Patient Relations.', status: 'COMPLETED',
    timestamps: { reported: lostWalletHospital.createdAt, matched: matchWalletHospital.createdAt, verified: daysAgo(0.4), authorized: daysAgo(0.35), ready: daysAgo(0.32), completed: daysAgo(0.3) }
  });
  // eslint-disable-next-line no-unused-vars
  const _doneHospital = completedReturnHospital;
  await store.updateReport(lostWalletHospital.id, { status: 'RETURNED' });
  await store.updateReport(foundWalletHospital.id, { status: 'RETURNED' });

  /* ---------------- chain of custody ---------------- */
  // (the `custody` helper is defined above, next to the first ledger write)

  // ABC School — the flask went all the way back to its owner.
  await custody({
    organizationId: abc.id, reportId: lostFlask.id, matchId: matchFlask.id, returnId: completedReturn.id,
    event: 'LOGGED', toCustodian: 'Security Desk', location: 'Sports Complex, Changing Area',
    note: 'Bottle handed in by the gym attendant.', actorUserId: securityAbc.id, actorName: 'Rohan Kulkarni',
    occurredAt: daysAgo(1.6)
  });
  await custody({
    organizationId: abc.id, reportId: lostFlask.id, matchId: matchFlask.id, returnId: completedReturn.id,
    event: 'STORED', fromCustodian: 'Security Desk', toCustodian: 'Lost property cage A3',
    location: 'Security Office', note: 'Placed in the tagged lost property cage.',
    actorUserId: securityAbc.id, actorName: 'Rohan Kulkarni', occurredAt: daysAgo(1.5)
  });
  await custody({
    organizationId: abc.id, reportId: lostFlask.id, matchId: matchFlask.id, returnId: completedReturn.id,
    event: 'RELEASED', fromCustodian: 'Lost property cage A3', toCustodian: 'Samarth Patil',
    location: 'Security Desk', note: 'Ownership verified; released against the handover code.',
    actorUserId: securityAbc.id, actorName: 'Rohan Kulkarni', occurredAt: daysAgo(1)
  });

  // TechCorp — the keyboard is verified and waiting at the Facilities Desk.
  await custody({
    organizationId: tech.id, reportId: lostLaptopTech.id, matchId: matchKeyboardTech.id, returnId: readyReturnTech.id,
    event: 'LOGGED', toCustodian: 'Facilities Desk, Lobby',
    location: 'Engineering Bay 3, Hyderabad', note: 'Keyboard handed in by the evening security shift.',
    actorUserId: securityTech.id, actorName: 'Imran Sheikh', occurredAt: daysAgo(1.1)
  });
  await custody({
    organizationId: tech.id, reportId: lostLaptopTech.id, matchId: matchKeyboardTech.id, returnId: readyReturnTech.id,
    event: 'HANDED_TO_STAFF', fromCustodian: 'Facilities Desk, Lobby', toCustodian: 'Meera Nair',
    location: 'Facilities Office, Hyderabad', note: 'Transferred for verification review.',
    actorUserId: securityTech.id, actorName: 'Imran Sheikh', occurredAt: daysAgo(0.8)
  });
  await custody({
    organizationId: tech.id, reportId: lostLaptopTech.id, matchId: matchKeyboardTech.id, returnId: readyReturnTech.id,
    event: 'STORED', fromCustodian: 'Meera Nair', toCustodian: 'Facilities safe, box 7',
    location: 'Facilities Office, Hyderabad', note: 'Awaiting collection; the owner has been notified.',
    actorUserId: staffTech.id, actorName: 'Meera Nair', occurredAt: daysAgo(0.5)
  });

  // City Hospital — the wallet was released to the patient.
  await custody({
    organizationId: hospital.id, reportId: lostWalletHospital.id, matchId: matchWalletHospital.id, returnId: completedReturnHospital.id,
    event: 'LOGGED', toCustodian: 'Patient Relations Counter', location: 'OPD Waiting Area, Block B',
    note: 'Wallet handed to the duty nurse.', actorUserId: nurseHospital.id, actorName: 'Sister Lily Thomas',
    occurredAt: daysAgo(0.7)
  });
  await custody({
    organizationId: hospital.id, reportId: lostWalletHospital.id, matchId: matchWalletHospital.id, returnId: completedReturnHospital.id,
    event: 'HANDED_OVER', fromCustodian: 'Patient Relations Counter', toCustodian: 'Arjun Mehta',
    location: 'Patient Relations Counter', note: 'Released after wristband and ownership questions were confirmed.',
    actorUserId: securityHospital.id, actorName: 'Deepak Kulkarni', occurredAt: daysAgo(0.3)
  });

  // Hackathon 2026 — intake plus a move to the mentor holding it, so the ledger
  // shows a real hand-off rather than a single lonely row.
  await custody({
    organizationId: hack.id, reportId: lostBadgeHack.id, matchId: matchBadgeHack.id,
    event: 'LOGGED', toCustodian: 'Check-in Desk, Main Hall', location: 'Main Hall, Table 12',
    note: 'Sticker pack dropped at the check-in desk.', actorUserId: mentorHack.id, actorName: 'Omar Haddad',
    occurredAt: daysAgo(0.5)
  });
  await custody({
    organizationId: hack.id, reportId: lostBadgeHack.id, matchId: matchBadgeHack.id,
    event: 'HANDED_TO_STAFF', fromCustodian: 'Check-in Desk, Main Hall', toCustodian: 'Omar Haddad',
    location: 'Mentors\' table, Main Hall', note: 'Held by a mentor until the owner collects it.',
    actorUserId: adminHack.id, actorName: 'Karthik Iyer', occurredAt: daysAgo(0.4)
  });

  /* ---------------- CCTV evidence ---------------- */
  // Stored exactly as POST /api/cctv/analyze writes it: label, confidence,
  // track id, frame count and the camera. These rows are object-detection
  // tracks, not face recognition results, and the confidences are honest about
  // how weak a single clip is.
  const cctvEvidence = (reportId, orgId, rows) => {
    const evidence = rows.map((r, i) => ({
      id: `CCTV-${orgId}-${reportId}-${i + 1}`,
      camera: r.camera, location: r.location, label: r.label,
      confidence: r.confidence, trackId: r.trackId, frameCount: r.frameCount,
      clipTime: r.clipTime, videoPath: r.videoPath,
      recordedAt: new Date(Date.now() - r.minutesAgo * 60000).toISOString(),
      recordedBy: r.recordedBy
    }));
    return store.updateReport(reportId, {
      cctvEvents: evidence.map((e) => `[${e.clipTime}] ${e.label} near ${e.location} (${e.camera})`),
      cctvEvidence: evidence
    });
  };

  await cctvEvidence(foundLaptopTech.id, tech.id, [{
    camera: 'CAM-ENG-03', location: 'Engineering Bay 3, Hyderabad', label: 'backpack',
    confidence: 0.61, trackId: 12, frameCount: 148, clipTime: '2026-09-25T09:14:22',
    videoPath: 'uploads/tech-2026-09-25-0914.mp4', recordedBy: 'Imran Sheikh', minutesAgo: 1400
  }]);

  await cctvEvidence(foundWalletHospital.id, hospital.id, [{
    camera: 'CAM-OPD-B2', location: 'OPD Waiting Area, Block B', label: 'person',
    confidence: 0.44, trackId: 7, frameCount: 96, clipTime: '2026-09-25T11:02:10',
    videoPath: 'uploads/city-2026-09-25-1102.mp4', recordedBy: 'Deepak Kulkarni', minutesAgo: 700
  }]);

  /* ---------------- notifications (for Samarth) ---------------- */
  await notificationService.notify(studentAbc.id, abc.id, {
    type: notificationService.TYPE.NEW_MATCH,
    title: 'Potential match found',
    message: `Your ${lostBackpack.itemProfile.itemName} may match an item found at ${foundBackpack.location}.`,
    referenceId: matchBackpack.id, referenceType: 'MATCH', meta: { finalScore: matchBackpack.finalScore }
  });
  await notificationService.notify(adminAbc.id, abc.id, {
    type: notificationService.TYPE.NEW_MATCH,
    title: 'Match found for your item',
    message: `Your ${lostAdminLaptop.itemProfile.itemName} may match an item found in the administration office.`,
    referenceId: matchAdminLaptop.id, referenceType: 'MATCH', meta: { finalScore: matchAdminLaptop.finalScore }
  });
  await notificationService.notify(studentAbc.id, abc.id, {
    type: notificationService.TYPE.VERIFICATION_REQUIRED,
    title: 'Ownership verification required',
    message: 'Please complete ownership verification for your matched backpack to proceed with the return.',
    referenceId: verifBackpack.id, referenceType: 'VERIFICATION'
  });
  await notificationService.notify(studentAbc.id, abc.id, {
    type: notificationService.TYPE.RETURN_READY,
    title: 'Your item is ready for pickup',
    message: 'Your laptop sleeve is ready for secure pickup at the Security Desk.',
    referenceId: lostLaptop.id, referenceType: 'REPORT', meta: { returnId: readyReturn.id }
  });
  await notificationService.notify(studentAbc.id, abc.id, {
    type: notificationService.TYPE.ITEM_RETURNED,
    title: 'Item returned successfully',
    message: 'Your Hydro Flask was handed over at the Security Desk. Thank you!',
    referenceId: lostFlask.id, referenceType: 'REPORT'
  });
  // Mark the oldest one as read so the UI shows a mix of read/unread.
  await store.markAllNotificationsRead(studentAbc.id, abc.id);
  // Re-create one unread to demonstrate the unread treatment.
  await notificationService.notify(studentAbc.id, abc.id, {
    type: notificationService.TYPE.NEW_MATCH,
    title: 'Potential match found',
    message: `Your ${lostFlask.itemProfile.itemName} may match an item found at ${foundFlask.location}.`,
    referenceId: matchFlask.id, referenceType: 'MATCH', meta: { finalScore: matchFlask.finalScore }
  });

  // A notification for the XYZ employee (isolation check).
  await notificationService.notify(employeeXyz.id, xyz.id, {
    type: notificationService.TYPE.NEW_MATCH,
    title: 'Potential match found',
    message: `Your ${lostUmbrella.itemProfile.itemName} may match a found item at ${foundUmbrella.location}.`,
    referenceId: matchUmbrella.id, referenceType: 'MATCH', meta: { finalScore: matchUmbrella.finalScore }
  });

  // Each new org gets an unread notification so the bell and the org inbox have
  // something real to show on first login.
  await notificationService.notify(engineerTech.id, tech.id, {
    type: notificationService.TYPE.NEW_MATCH,
    title: 'Potential match found',
    message: `Your ${lostLaptopTech.itemProfile.itemName} may match an item found at ${foundLaptopTech.location}.`,
    referenceId: matchKeyboardTech.id, referenceType: 'MATCH', meta: { finalScore: matchKeyboardTech.finalScore }
  });
  await notificationService.notify(engineerTech.id, tech.id, {
    type: notificationService.TYPE.VERIFICATION_REQUIRED,
    title: 'Ownership verification required',
    message: 'Please complete the ownership questions for your mechanical keyboard to release it for pickup.',
    referenceId: verifKeyboard.id, referenceType: 'VERIFICATION'
  });
  await notificationService.notify(patientHospital.id, hospital.id, {
    type: notificationService.TYPE.ITEM_RETURNED,
    title: 'Item returned successfully',
    message: 'Your wallet was released at Patient Relations after verification. Thank you.',
    referenceId: lostWalletHospital.id, referenceType: 'REPORT'
  });
  await notificationService.notify(hackerHack.id, hack.id, {
    type: notificationService.TYPE.NEW_MATCH,
    title: 'Potential match found',
    message: `Your ${lostBadgeHack.itemProfile.itemName} may match an item found at ${foundBadgeHack.location}.`,
    referenceId: matchBadgeHack.id, referenceType: 'MATCH', meta: { finalScore: matchBadgeHack.finalScore }
  });
  await notificationService.notify(hackerHack.id, hack.id, {
    type: notificationService.TYPE.VERIFICATION_REQUIRED,
    title: 'Confirm you own it',
    message: 'Verification is optional at this event, but it helps us hand the right pack to the right person.',
    referenceId: verifBadgeHack.id, referenceType: 'VERIFICATION'
  });

  /* ---------------- audit logs ---------------- */
  const audit = (userId, action, entityType, entityId, metadata, orgId = abc.id) =>
    store.createAuditLog({ organizationId: orgId, userId, action, entityType, entityId, metadata, ip: 'seed' });

  await audit(studentAbc.id, 'REPORT_CREATED', 'REPORT', lostBackpack.id, { type: 'LOST', category: 'Backpack' });
  await audit(studentAbc.id, 'REPORT_CREATED', 'REPORT', lostFlask.id, { type: 'LOST', category: 'Water Bottle' });
  await audit(staffAbc.id, 'REPORT_CREATED', 'REPORT', foundBackpack.id, { type: 'FOUND', category: 'Backpack' });
  await audit(securityAbc.id, 'REPORT_CREATED', 'REPORT', foundFlask.id, { type: 'FOUND', category: 'Water Bottle' });
  await audit(securityAbc.id, 'QR_SCANNED', 'RETURN', completedReturn.id, { reportId: lostFlask.id, pickupLocation: 'Security Desk' });
  await audit(securityAbc.id, 'RETURN_AUTHORIZED', 'RETURN', readyReturn.id, { reportId: lostLaptop.id }, abc.id);
  await audit(adminAbc.id, 'ORG_CREATED', 'ORGANIZATION', abc.id, {}, abc.id);
  await audit(employeeXyz.id, 'REPORT_CREATED', 'REPORT', lostUmbrella.id, { type: 'LOST', category: 'Umbrella' }, xyz.id);
  await audit(adminXyz.id, 'ORG_CREATED', 'ORGANIZATION', xyz.id, {}, xyz.id);
  await audit(adminXyz.id, 'VERIFICATION_APPROVED', 'VERIFICATION', verifUmbrella.id, { reportId: lostUmbrella.id }, xyz.id);
  await audit(adminXyz.id, 'QR_SCANNED', 'RETURN', completedReturnXyz.id, { reportId: lostUmbrella.id, pickupLocation: 'Front Office' }, xyz.id);

  // Audit rows for the three added organizations, including the custody
  // hand-offs, so the audit log screen is not empty for any demo account.
  await audit(adminTech.id, 'ORG_CREATED', 'ORGANIZATION', tech.id, {}, tech.id);
  await audit(engineerTech.id, 'REPORT_CREATED', 'REPORT', lostLaptopTech.id, { type: 'LOST', category: 'Electronics' }, tech.id);
  await audit(securityTech.id, 'REPORT_CREATED', 'REPORT', foundLaptopTech.id, { type: 'FOUND', category: 'Electronics' }, tech.id);
  await audit(securityTech.id, 'CUSTODY_HANDOFF', 'REPORT', lostLaptopTech.id, { event: 'HANDED_TO_STAFF', to: 'Meera Nair' }, tech.id);
  await audit(adminHospital.id, 'ORG_CREATED', 'ORGANIZATION', hospital.id, {}, hospital.id);
  await audit(patientHospital.id, 'REPORT_CREATED', 'REPORT', lostWalletHospital.id, { type: 'LOST', category: 'Personal' }, hospital.id);
  await audit(nurseHospital.id, 'REPORT_CREATED', 'REPORT', foundWalletHospital.id, { type: 'FOUND', category: 'Personal' }, hospital.id);
  await audit(nurseHospital.id, 'VERIFICATION_APPROVED', 'VERIFICATION', verifWallet.id, { reportId: lostWalletHospital.id }, hospital.id);
  await audit(securityHospital.id, 'QR_SCANNED', 'RETURN', completedReturnHospital.id, { reportId: lostWalletHospital.id, pickupLocation: 'Patient Relations Counter' }, hospital.id);
  await audit(adminHack.id, 'ORG_CREATED', 'ORGANIZATION', hack.id, {}, hack.id);
  await audit(hackerHack.id, 'REPORT_CREATED', 'REPORT', lostBadgeHack.id, { type: 'LOST', category: 'Electronics' }, hack.id);
  await audit(mentorHack.id, 'REPORT_CREATED', 'REPORT', foundBadgeHack.id, { type: 'FOUND', category: 'Electronics' }, hack.id);

  // eslint-disable-next-line no-console
  console.log('[seed] demo data created: 5 orgs, 18 users, 64 reports (24 base + 40 recovery board), 33 matches, 17 verifications, 17 returns, custody records, 2 CCTV evidence sets, notifications + audit logs');
}

module.exports = { seed, FREE_DOMAINS };
