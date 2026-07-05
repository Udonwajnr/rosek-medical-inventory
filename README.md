# Rosek — Medical Inventory & Dispensing API

Backend for the Rosek hospital medication inventory platform. Hospitals register, manage their drug inventory and patients, record purchases/dispensing, and the system generates medication schedules — calendar (.ics) files emailed to patients and SMS reminders.

Frontend: [medical-inventory](https://github.com/Udonwajnr/medical-inventory) (Next.js)

## Stack

- Node.js + Express
- MongoDB + Mongoose
- JWT auth (access + refresh tokens), bcryptjs
- Nodemailer (verification, password reset, calendar emails)
- Termii / Twilio (SMS reminders)
- Socket.io (live inventory updates)

## Getting started

```bash
git clone https://github.com/Udonwajnr/medical-api.git
cd medical-api
npm install
cp .env.example .env   # fill in your values
npm run dev
```

## Environment variables

See `.env.example`. Nothing sensitive is committed — all keys live in `.env`.

## API overview

All routes are prefixed with `/api`. Routes marked 🔒 require `Authorization: Bearer <accessToken>`.

### Hospital auth — `/api/hospital`
| Method | Route | Description |
|---|---|---|
| POST | `/register` | Register a hospital (sends verification email) |
| GET | `/verify-email/:token` | Verify email |
| POST | `/login` | Login → access token + refresh cookie |
| POST | `/refresh-token` | Rotate access token |
| POST | `/logout` | Logout |
| POST | `/forgot-password`, `/reset-password` | Password reset flow |
| 🔒 PUT/DELETE | `/:id` | Update / delete hospital |

### Users (patients) — `/api/user` 🔒
| Method | Route |
|---|---|
| GET | `/hospital/:hospitalId/users` |
| GET | `/hospital/:hospitalId/users/search?query=` |
| GET/PUT/DELETE | `/hospital/:hospitalId/users/:userId` |
| POST | `/hospital/:hospitalId/users` |
| POST/DELETE | `/hospital/:hospitalId/users/:userId/medication/:medicationId` |
| GET | `/hospital/:hospitalId/medication/:medicationId/users` |

### Medications — `/api/medication` 🔒 (except `/all`)
CRUD scoped to a hospital: `/:hospitalId/medications[/:id]`, plus `/:hospitalId/search`.

### Purchases — `/api/purchase` 🔒
| Method | Route | Description |
|---|---|---|
| POST | `/` | Record a purchase — validates stock, computes total from prices, decrements inventory, emails an .ics medication schedule |
| GET | `/hospital/:hospitalId` | All purchases for a hospital |
| GET | `/hospital/:hospitalId/user/:userId` | A user's purchases |
| GET | `/:purchaseId` | Single purchase |

### Regimens — `/api/regimens` 🔒
Custom per-patient prescriptions: create, update, delete, list by hospital.
