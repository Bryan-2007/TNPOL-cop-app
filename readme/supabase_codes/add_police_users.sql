/* =====================================================
   ADD DEFAULT POLICE USERS FOR EACH STATION
===================================================== */

-- Get station IDs and insert corresponding police users
-- These are default credentials - CHANGE THESE IN PRODUCTION!

-- Hash for password "TN@police123" (bcrypt)
-- You can generate new hashes from: node -e "const bcrypt = require('bcrypt'); console.log(bcrypt.hashSync('TN@police123', 10))"

INSERT INTO users (name, email, phone, password_hash, role, created_at)
VALUES
  (
    'T Nagar Police Station',
    'police.tnagar@tnpol.gov.in',
    '+91-44-2432-1234',
    '$2b$10$U7ngrlnMYXibesh6J2qiKun7Z2qLpR6CLpWrbJGEcamYOe3Ic4qoC', -- Replace with actual hash
    'police',
    now()
  ),
  (
    'Adyar Police Station',
    'police.adyar@tnpol.gov.in',
    '+91-44-2440-5678',
    '$2b$10$U7ngrlnMYXibesh6J2qiKun7Z2qLpR6CLpWrbJGEcamYOe3Ic4qoC', -- Replace with actual hash
    'police',
    now()
  ),
  (
    'Tambaram Police Station',
    'police.tambaram@tnpol.gov.in',
    '+91-44-2228-9999',
    '$2b$10$U7ngrlnMYXibesh6J2qiKun7Z2qLpR6CLpWrbJGEcamYOe3Ic4qoC', -- Replace with actual hash
    'police',
    now()
  )
ON CONFLICT (email) DO NOTHING;

SELECT 'Police users created successfully' as status;
