# 🚀 GitHub Pages Deployment Guide

## Step-by-Step Instructions

### 1️⃣ Create GitHub Repository

1. Go to [GitHub](https://github.com) and sign in
2. Click the **"+"** icon in the top-right → **"New repository"**
3. Repository settings:
   - **Name:** `biohax-performance-os` (or your preferred name)
   - **Description:** "Revolutionary longevity platform powered by AI"
   - **Visibility:** Public (required for free GitHub Pages)
   - ✅ Check "Add a README file"
   - Click **"Create repository"**

### 2️⃣ Prepare Your Local Files

Download/export all files from Figma Make to a local folder.

### 3️⃣ Initialize Git & Push

Open terminal in your project folder:

```bash
# Initialize git (if not already initialized)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - BioHax Performance OS v1.0"

# Add remote (replace YOUR-USERNAME and REPO-NAME)
git remote add origin https://github.com/YOUR-USERNAME/biohax-performance-os.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### 4️⃣ Configure vite.config.ts

**IMPORTANT:** Update the `base` property in `/vite.config.ts`:

```typescript
export default defineConfig({
  plugins: [react()],
  base: '/biohax-performance-os/', // ⚠️ CHANGE THIS to match your repo name
  // ...
});
```

If your repo is named differently, use:
- Repo: `my-health-app` → `base: '/my-health-app/'`
- Repo: `longevity-os` → `base: '/longevity-os/'`

### 5️⃣ Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** tab
3. Scroll to **Pages** section (left sidebar)
4. Under **Source**, select:
   - **Source:** GitHub Actions (not "Deploy from branch")
5. Click **Save**

### 6️⃣ Install Dependencies & Deploy

```bash
# Install dependencies
npm install

# Build locally to test (optional)
npm run build

# Preview build locally (optional)
npm run preview

# Commit the vite.config.ts change
git add vite.config.ts
git commit -m "Configure base path for GitHub Pages"
git push
```

### 7️⃣ Automatic Deployment

The GitHub Action workflow (`.github/workflows/deploy.yml`) will:
1. ✅ Automatically trigger on every push to `main`
2. ✅ Install dependencies
3. ✅ Build the project
4. ✅ Deploy to GitHub Pages

**Check deployment status:**
1. Go to **Actions** tab in your repo
2. Watch the "Deploy to GitHub Pages" workflow
3. Wait for green checkmark ✅

### 8️⃣ Access Your Live Site

Once deployed, your site will be available at:

```
https://YOUR-USERNAME.github.io/biohax-performance-os/
```

**Example:**
- Username: `johndoe`
- Repo: `biohax-performance-os`
- URL: `https://johndoe.github.io/biohax-performance-os/`

---

## 🔧 Manual Deployment (Alternative)

If you prefer manual deployment:

```bash
# Install gh-pages package
npm install --save-dev gh-pages

# Deploy manually
npm run deploy
```

---

## 🐛 Troubleshooting

### Issue: 404 Error / Blank Page

**Solution:** Check your `vite.config.ts` base path:
```typescript
base: '/YOUR-EXACT-REPO-NAME/', // Must match exactly!
```

### Issue: GitHub Action Fails

**Solution:** Check GitHub Pages settings:
1. Settings → Pages → Source should be "GitHub Actions"
2. Make sure repo is public
3. Check Actions tab for error logs

### Issue: CSS/Images Not Loading

**Solution:** All imports should use relative paths:
```typescript
// ✅ Correct
import './styles/globals.css'

// ❌ Wrong
import '/styles/globals.css'
```

### Issue: Deployment Works but App Doesn't Load

**Solution:** Check `index.html` script path:
```html
<!-- Should be relative -->
<script type="module" src="/main.tsx"></script>
```

---

## 🔄 Update Workflow

After initial deployment, to update your site:

```bash
# Make changes to your code

# Commit and push
git add .
git commit -m "Update: description of changes"
git push

# GitHub Action will auto-deploy!
```

---

## 🎯 Custom Domain (Optional)

Want a custom domain like `biohax.com`?

1. Buy domain from registrar (Namecheap, GoDaddy, etc.)
2. Add `CNAME` file to repository root:
   ```
   biohax.com
   ```
3. Configure DNS records at your registrar:
   ```
   Type: CNAME
   Name: www
   Value: YOUR-USERNAME.github.io
   ```
4. In GitHub: Settings → Pages → Custom domain → Enter `biohax.com`

---

## 📊 Analytics (Optional)

Add Google Analytics to track visitors:

1. Get GA4 tracking ID
2. Add to `index.html`:
```html
<head>
  <!-- Google Analytics -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-XXXXXXXXXX');
  </script>
</head>
```

---

## ✅ Deployment Checklist

- [ ] GitHub repository created
- [ ] All files pushed to GitHub
- [ ] `vite.config.ts` base path matches repo name
- [ ] GitHub Pages enabled (Source: GitHub Actions)
- [ ] Dependencies installed (`npm install`)
- [ ] Build succeeds locally (`npm run build`)
- [ ] GitHub Action workflow completes ✅
- [ ] Site accessible at GitHub Pages URL
- [ ] All pages load correctly
- [ ] Navigation works
- [ ] Images/CSS load properly

---

## 🎉 Success!

Your BioHax Performance OS is now live on GitHub Pages!

**Share your link:**
```
🔗 https://YOUR-USERNAME.github.io/biohax-performance-os/
```

**Next Steps:**
1. Share on social media
2. Add to your portfolio
3. Customize with your branding
4. Collect feedback from users

---

## 📞 Need Help?

- [GitHub Pages Docs](https://docs.github.com/en/pages)
- [Vite Deployment Docs](https://vitejs.dev/guide/static-deploy.html)
- [GitHub Actions Docs](https://docs.github.com/en/actions)

---

**Last Updated:** November 2025  
**Status:** ✅ Production Ready
