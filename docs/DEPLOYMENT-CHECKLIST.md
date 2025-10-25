# ERP System Deployment Checklist

Complete checklist for deploying the entire ERP system to production.

## Pre-Deployment

- [ ] Git repositories up to date
  - [ ] Backend: `ball02k/2025_Backend_ERP`
  - [ ] Frontend: `ball02k/2025_ERP`
- [ ] All local tests passing
- [ ] Database migrations tested locally
- [ ] Environment variables documented

---

## 1. Database Setup (Neon/PostgreSQL)

- [ ] Provision PostgreSQL database
  - [ ] Service: Neon, Supabase, or AWS RDS
  - [ ] Plan: Starter (scalable to Pro)
  - [ ] Region: Choose closest to API server
- [ ] Save database credentials
  - [ ] `DATABASE_URL`
  - [ ] `SHADOW_DATABASE_URL` (for migrations)
- [ ] Test connection from local machine
  ```bash
  psql "postgres://user:pass@host:5432/dbname"
  ```

**Status:** ⬜ Not Started | 🟡 In Progress | ✅ Complete

---

## 2. ONLYOFFICE Document Server

### Option A: Automated Deployment

- [ ] Provision Ubuntu 22.04/24.04 server
  - [ ] Provider: DigitalOcean, Hetzner, AWS Lightsail
  - [ ] Specs: 2 vCPU, 4GB RAM minimum
  - [ ] Open ports: 80, 443
- [ ] Configure DNS A record
  - [ ] Domain: `docs.yourdomain.com`
  - [ ] Points to: Server public IP
  - [ ] TTL: 300-600 seconds
  - [ ] Wait for DNS propagation (~5-10 min)
- [ ] Run deployment script
  ```bash
  wget https://raw.githubusercontent.com/ball02k/2025_Backend_ERP/main/scripts/deploy-onlyoffice-ubuntu.sh
  sudo bash deploy-onlyoffice-ubuntu.sh docs.yourdomain.com your@email.com
  ```
- [ ] Save JWT secret from script output
- [ ] Test Document Server: `https://docs.yourdomain.com`

### Option B: Manual Deployment

- [ ] Follow [ONLYOFFICE-DEPLOYMENT.md](./ONLYOFFICE-DEPLOYMENT.md)
- [ ] Save JWT secret

**Status:** ⬜ Not Started | 🟡 In Progress | ✅ Complete

---

## 3. Backend Deployment (Render.com)

### Setup

- [ ] Sign up/login to Render.com
- [ ] Connect GitHub repository
  - [ ] Repo: `ball02k/2025_Backend_ERP`
  - [ ] Branch: `main`
  - [ ] Auto-deploy: Enabled

### Configuration

- [ ] Create Web Service
  - [ ] Name: `erp-backend`
  - [ ] Environment: `Node`
  - [ ] Region: Oregon (or closest)
  - [ ] Branch: `main`
  - [ ] Build Command: `npm run render-build`
  - [ ] Start Command: `npm run render-start`

### Environment Variables

Set these in Render dashboard:

- [ ] `DATABASE_URL` → from Neon
- [ ] `SHADOW_DATABASE_URL` → from Neon (optional, same as DATABASE_URL)
- [ ] `ONLYOFFICE_DS_URL` → `https://docs.yourdomain.com`
- [ ] `ONLYOFFICE_JWT_SECRET` → from ONLYOFFICE deployment
- [ ] `APP_BASE_URL` → `https://your-service.onrender.com`
- [ ] `FILE_STORAGE_DIR` → `./uploads/contracts`
- [ ] `MODEL_PROVIDER` → `ollama` (or `openai`)
- [ ] `OLLAMA_BASE_URL` → your Ollama server (if using)
- [ ] `OLLAMA_MODEL` → `llama3.1:8b` (if using)
- [ ] `PORT` → `3001` (optional, Render sets this)
- [ ] `NODE_ENV` → `production`

### Deploy

- [ ] Trigger manual deploy or push to main
- [ ] Monitor build logs
  - [ ] Look for: "🔧 MIGRATION FIX SCRIPT STARTING"
  - [ ] Should see: "✅ ALL MIGRATIONS APPLIED SUCCESSFULLY"
- [ ] Wait for: "==> Build successful 🎉"
- [ ] Verify service is running

### Test Backend

- [ ] Health check: `https://your-service.onrender.com/health`
  ```bash
  curl https://your-service.onrender.com/health
  # Should return: {"ok":true,"version":"1.0.0","time":"..."}
  ```
- [ ] Test API endpoint
  ```bash
  curl https://your-service.onrender.com/api/projects \
    -H "X-Tenant-Id: demo"
  ```

**Status:** ⬜ Not Started | 🟡 In Progress | ✅ Complete

---

## 4. Frontend Deployment (Render.com or Vercel)

### Option A: Render Static Site

- [ ] Create Static Site
  - [ ] Repo: `ball02k/2025_ERP`
  - [ ] Branch: `main`
  - [ ] Build Command: `npm run build`
  - [ ] Publish Directory: `dist`

### Option B: Vercel

- [ ] Import Git repository
- [ ] Framework Preset: Vite
- [ ] Build Command: `npm run build`
- [ ] Output Directory: `dist`

### Environment Variables

- [ ] `VITE_API_URL` → `https://your-backend.onrender.com`

### Deploy & Test

- [ ] Deploy
- [ ] Visit frontend URL
- [ ] Test login
- [ ] Create/view projects
- [ ] Test contract creation and editing

**Status:** ⬜ Not Started | 🟡 In Progress | ✅ Complete

---

## 5. End-to-End Testing

### Authentication & Basic Navigation

- [ ] Login with test credentials
- [ ] Dashboard loads correctly
- [ ] All sidebar links work
- [ ] No console errors

### Projects

- [ ] Create new project
- [ ] View project details
- [ ] Edit project information
- [ ] Add team members

### Budgets

- [ ] Create budget line items
- [ ] Import CSV (if applicable)
- [ ] View budget summary
- [ ] Export budget

### Packages & Procurement

- [ ] Create package
- [ ] Add package line items
- [ ] Direct Award flow works
- [ ] Supplier selection

### Contracts (ONLYOFFICE Integration)

- [ ] Create contract via Direct Award
- [ ] Click "Edit" button
- [ ] ONLYOFFICE editor loads
- [ ] Type in document
- [ ] Save document (Ctrl+S or auto-save)
- [ ] Close editor
- [ ] Verify version saved in backend
- [ ] Reopen contract - previous edits visible
- [ ] Update contract status (Draft → InternalReview → Approved)

### Finance

- [ ] View financial summary
- [ ] Create/view invoices
- [ ] Create/view purchase orders
- [ ] CVR reporting (if enabled)

**Status:** ⬜ Not Started | 🟡 In Progress | ✅ Complete

---

## 6. Post-Deployment

### Documentation

- [ ] Document production URLs
  - [ ] Frontend: `____________`
  - [ ] Backend: `____________`
  - [ ] Document Server: `____________`
  - [ ] Database: `____________`
- [ ] Document admin credentials (store securely)
- [ ] Share deployment guide with team

### Monitoring (Optional but Recommended)

- [ ] Set up uptime monitoring
  - [ ] UptimeRobot (free)
  - [ ] Pingdom
  - [ ] StatusCake
- [ ] Set up error tracking
  - [ ] Sentry (free tier)
  - [ ] Rollbar
- [ ] Set up log aggregation
  - [ ] Papertrail (Render built-in)
  - [ ] Logtail

### Backups

- [ ] Database automated backups enabled
  - [ ] Neon: Automatic point-in-time recovery
  - [ ] Verify backup schedule
- [ ] Document Server backups
  ```bash
  # Backup JWT config
  sudo cp /etc/onlyoffice/documentserver/local.json ~/backup/
  ```
- [ ] Application code
  - [ ] Git repositories are backup
  - [ ] Tag production releases

### Security

- [ ] Environment variables secured
- [ ] Database credentials rotated (if needed)
- [ ] JWT secrets documented in password manager
- [ ] SSL certificates auto-renewing (Let's Encrypt)
- [ ] Firewall rules configured (Ubuntu server)

**Status:** ⬜ Not Started | 🟡 In Progress | ✅ Complete

---

## Troubleshooting

### Backend Won't Deploy

**Issue:** Migration errors

**Check:** Render build logs for migration fix script output
```
🔧 MIGRATION FIX SCRIPT STARTING
```

**Fix:** 
- Verify `scripts/fix-migrations.sh` is executable
- Check DATABASE_URL is correct
- Manually resolve migration via Render shell

---

### ONLYOFFICE Editor Won't Load

**Issue:** Mixed content or CORS errors

**Check:** Browser console

**Fix:**
- Ensure both frontend and Document Server use HTTPS
- Verify JWT secret matches between ERP and Document Server
- Check `ONLYOFFICE_DS_URL` environment variable

---

### Documents Don't Save

**Issue:** Callback endpoint unreachable

**Check:** Backend logs for callback requests

**Fix:**
- Ensure `APP_BASE_URL` is publicly accessible
- Cannot use `localhost` - Document Server must reach backend
- Test: `curl https://your-backend.com/api/contracts/1/onlyoffice/callback`

---

## Rollback Plan

If deployment fails:

1. **Backend:** Revert to previous deployment in Render dashboard
2. **Frontend:** Revert to previous deployment or redeploy stable commit
3. **Database:** Restore from backup (if migrations ran)
4. **Document Server:** Service is independent, rollback not needed

---

## Success Criteria

✅ All checklist items complete
✅ End-to-end tests passing
✅ No errors in production logs
✅ Team can access and use system
✅ Contracts can be created and edited

---

## Deployment Complete! 🎉

**Next Steps:**
1. Monitor system for 24 hours
2. Gather user feedback
3. Plan next iteration
4. Celebrate! 🍾

---

**Need Help?**
- Review deployment docs: [ONLYOFFICE-DEPLOYMENT.md](./ONLYOFFICE-DEPLOYMENT.md)
- Check Render logs: `https://dashboard.render.com/logs`
- Review GitHub commit history
