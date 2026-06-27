-- ============================================================
-- schema-settings.sql
-- جدول تنظیمات عمومی اپلیکیشن + چارت سازمانی
-- ============================================================

-- ─── جدول تنظیمات ───
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  section TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB,
  label TEXT DEFAULT '',
  description TEXT DEFAULT '',
  type TEXT DEFAULT 'text',
  options JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(section, key)
);

-- تابع به‌روزرسانی updated_at (اگر قبلاً ایجاد نشده باشد)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger به‌روزرسانی updated_at
DROP TRIGGER IF EXISTS update_app_settings_updated_at ON app_settings;
CREATE TRIGGER update_app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- جدول چارت سازمانی
-- ============================================================
CREATE TABLE IF NOT EXISTS org_chart (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_id UUID REFERENCES org_chart(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  department TEXT DEFAULT '',
  user_id UUID,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_chart_parent ON org_chart(parent_id);
CREATE INDEX IF NOT EXISTS idx_org_chart_user ON org_chart(user_id);

DROP TRIGGER IF EXISTS update_org_chart_updated_at ON org_chart;
CREATE TRIGGER update_org_chart_updated_at
  BEFORE UPDATE ON org_chart
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ─── Seed data: چارت سازمانی پیش‌فرض ───
INSERT INTO org_chart (title, department, sort_order) VALUES
('مدیرعامل', 'مدیریت', 1)
ON CONFLICT DO NOTHING;

-- زیرمجموعه‌های مدیرعامل (parent_id باید با زیرکوئری گرفته شود)
INSERT INTO org_chart (parent_id, title, department, sort_order)
SELECT id, 'مدیر فروش', 'فروش', 1 FROM org_chart WHERE title = 'مدیرعامل' AND parent_id IS NULL
UNION ALL
SELECT id, 'مدیر مالی', 'مالی', 2 FROM org_chart WHERE title = 'مدیرعامل' AND parent_id IS NULL
UNION ALL
SELECT id, 'مدیر تولید', 'تولید', 3 FROM org_chart WHERE title = 'مدیرعامل' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

-- زیرمجموعه‌های مدیر فروش
INSERT INTO org_chart (parent_id, title, department, sort_order)
SELECT id, 'کارشناس فروش', 'فروش', 1 FROM org_chart WHERE title = 'مدیر فروش' AND parent_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- زیرمجموعه‌های مدیر مالی
INSERT INTO org_chart (parent_id, title, department, sort_order)
SELECT id, 'حسابدار', 'مالی', 1 FROM org_chart WHERE title = 'مدیر مالی' AND parent_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- زیرمجموعه‌های مدیر تولید
INSERT INTO org_chart (parent_id, title, department, sort_order)
SELECT id, 'انباردار', 'تولید', 1 FROM org_chart WHERE title = 'مدیر تولید' AND parent_id IS NOT NULL
UNION ALL
SELECT id, 'تکنسین تولید', 'تولید', 2 FROM org_chart WHERE title = 'مدیر تولید' AND parent_id IS NOT NULL
UNION ALL
SELECT id, 'راننده', 'تولید', 3 FROM org_chart WHERE title = 'مدیر تولید' AND parent_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ============================================================
-- SEED DATA — داده‌های اولیه
-- ============================================================

-- ─── 1. تنظیمات عمومی ───
INSERT INTO app_settings (section, key, value, label, description, type) VALUES
('general', 'company_name', '"شرکت آذرمهر صنعت"', 'نام شرکت', 'نام شرکت در سراسر اپ نمایش داده می‌شود', 'text'),
('general', 'company_phone', '"021-12345678"', 'تلفن شرکت', 'شماره تماس اصلی شرکت', 'text'),
('general', 'company_address', '"تهران، خیابان..."', 'آدرس شرکت', 'آدرس کامل شرکت', 'text'),
('general', 'company_logo', '""', 'لوگوی شرکت', 'URL تصویر لوگو', 'image'),
('general', 'admin_title', '"پنل مدیریت آذرمهر صنعت"', 'عنوان پنل مدیریت', 'عنوانی که در هدر پنل ادمین نمایش داده می‌شود', 'text')
ON CONFLICT (section, key) DO NOTHING;

-- ─── 2. تنظیمات گردش کار ───
INSERT INTO app_settings (section, key, value, label, description, type) VALUES
('workflow', 'auto_create_project', 'true', 'ایجاد خودکار پروژه', 'آیا پس از تأیید مدیر فروش، پروژه به صورت خودکار ایجاد شود؟', 'boolean'),
('workflow', 'auto_create_project_on_status', '"proforma_issued"', 'وضعیت مبدأ ایجاد پروژه', 'در کدام وضعیت سفارش، پروژه ساخته شود', 'select'),
('workflow', 'stock_check_enabled', 'true', 'بررسی موجودی انبار', 'آیا مرحله بررسی موجودی انبار فعال است؟', 'boolean'),
('workflow', 'production_enabled', 'true', 'ارجاع به تولید', 'آیا برای کالاهای بدون موجودی، ارجاع به تولید فعال است؟', 'boolean'),
('workflow', 'finance_approval_enabled', 'true', 'تأیید مدیر مالی', 'آیا مرحله تأیید مدیر مالی برای خروج کالا فعال است؟', 'boolean'),
('workflow', 'customer_confirmation_required', 'true', 'تأیید مشتری الزامی است', 'آیا مشتری باید پیش‌فاکتور را تأیید کند؟', 'boolean')
ON CONFLICT (section, key) DO NOTHING;

-- ─── 3. انتساب مسئولین (نقش‌های عملیاتی) ───
INSERT INTO app_settings (section, key, value, label, description, type, options) VALUES
('assignments', 'sales_agent_user_id', '""', 'مسئول فروش و پیگیری مالی', 'کاربری که پیش‌فاکتور ارسال و پیگیری مالی می‌کند', 'user_select', '[]'),
('assignments', 'warehouse_keeper_user_id', '""', 'انباردار', 'کاربری که اجناس را آماده می‌کند', 'user_select', '[]'),
('assignments', 'financial_manager_user_id', '""', 'مدیر مالی', 'کاربری که مجوز خروج صادر می‌کند', 'user_select', '[]'),
('assignments', 'driver_user_id', '""', 'راننده', 'کاربری که حمل کالا را انجام می‌دهد', 'user_select', '[]'),
('assignments', 'production_manager_user_id', '""', 'مدیر تولید', 'کاربری که تولید را مدیریت می‌کند', 'user_select', '[]')
ON CONFLICT (section, key) DO NOTHING;

-- ─── 4. ترتیب وضعیت‌های گردش کار ───
INSERT INTO app_settings (section, key, value, label, description, type) VALUES
('workflow', 'status_flow', '["registered","proforma_issued","payment_confirmed","in_production","ready_to_ship","shipped","delivered"]', 'ترتیب وضعیت‌ها', 'دنباله وضعیت‌های سفارش به ترتیب', 'json')
ON CONFLICT (section, key) DO NOTHING;

-- ─── 5. ظاهر و دیزاین پرتال ───
INSERT INTO app_settings (section, key, value, label, description, type) VALUES
('appearance', 'portal_primary_color', '"#D4880E"', 'رنگ اصلی پرتال', 'رنگ اصلی دکمه‌ها و المان‌های پرتال مشتریان', 'color'),
('appearance', 'portal_secondary_color', '"#1a1a2e"', 'رنگ ثانویه پرتال', 'رنگ پس‌زمینه هدر و فوتر پرتال', 'color'),
('appearance', 'portal_banner_url', '""', 'بنر صفحه اصلی پرتال', 'تصویر بنر در صفحه اصلی پرتال مشتریان', 'image'),
('appearance', 'portal_login_image', '""', 'تصویر صفحه ورود', 'تصویر背景 صفحه لاگین پرتال', 'image'),
('appearance', 'portal_footer_text', '"کلیه حقوق محفوظ است © آذرمهر صنعت"', 'متن فوتر پرتال', 'متنی که در پایین پرتال نمایش داده می‌شود', 'text'),
('appearance', 'portal_welcome_title', '"به پورتال عمده‌فروشی آذرمهر صنعت خوش آمدید"', 'عنوان خوش‌آمدگویی', 'عنوان صفحه اصلی پرتال', 'text'),
('appearance', 'portal_welcome_text', '"سفارش خود را به صورت آنلاین ثبت کنید و از وضعیت آن مطلع شوید"', 'متن خوش‌آمدگویی', 'متن توضیحی صفحه اصلی پرتال', 'textarea'),
('appearance', 'admin_primary_color', '"#1a1a2e"', 'رنگ اصلی پنل مدیریت', 'رنگ اصلی سایدبار و المان‌های پنل ادمین', 'color'),
('appearance', 'admin_logo_url', '""', 'لوگوی پنل مدیریت', 'URL تصویر لوگو در هدر پنل ادمین', 'image')
ON CONFLICT (section, key) DO NOTHING;

-- ─── 6. نوتیفیکیشن‌ها ───
INSERT INTO app_settings (section, key, value, label, description, type, options) VALUES
('notifications', 'notify_on_new_order', '["sales_agent_user_id"]', 'اعلان سفارش جدید', 'چه کسانی از ثبت سفارش جدید مطلع شوند', 'multi_user_select', '[]'),
('notifications', 'notify_on_customer_confirm', '["sales_agent_user_id","financial_manager_user_id"]', 'اعلان تأیید مشتری', 'چه کسانی از تأیید پیش‌فاکتور توسط مشتری مطلع شوند', 'multi_user_select', '[]'),
('notifications', 'notify_on_warehouse_ready', '["financial_manager_user_id","driver_user_id"]', 'اعلان آماده‌سازی کالا', 'چه کسانی از آماده شدن کالا در انبار مطلع شوند', 'multi_user_select', '[]'),
('notifications', 'notify_on_payment_received', '["sales_agent_user_id","warehouse_keeper_user_id"]', 'اعلان دریافت وجه', 'چه کسانی از واریز وجه مطلع شوند', 'multi_user_select', '[]')
ON CONFLICT (section, key) DO NOTHING;

INSERT INTO app_settings (section, key, value, label, description, type) VALUES
('notifications', 'sms_enabled', 'false', 'پیامک فعال', 'آیا ارسال پیامک فعال است؟', 'boolean'),
('notifications', 'eitaa_enabled', 'false', 'ربات ایتا فعال', 'آیا ارسال پیام از طریق ربات ایتا فعال است؟', 'boolean')
ON CONFLICT (section, key) DO NOTHING;

-- ─── 7. تنظیمات سفارش ───
INSERT INTO app_settings (section, key, value, label, description, type) VALUES
('order', 'default_order_status', '"registered"', 'وضعیت پیش‌فرض سفارش', 'وضعیت اولیه هنگام ثبت سفارش جدید', 'text'),
('order', 'order_prefix', '""', 'پیشوند شماره سفارش', 'پیشوندی که قبل از شماره سفارش نمایش داده می‌شود', 'text'),
('order', 'auto_order_numbering', 'true', 'شماره‌دهی خودکار', 'آیا شماره سفارش به صورت خودکار تولید شود؟', 'boolean')
ON CONFLICT (section, key) DO NOTHING;

-- ─── 8. تنظیمات پروژه ───
INSERT INTO app_settings (section, key, value, label, description, type, options) VALUES
('project', 'default_project_status', '"active"', 'وضعیت پیش‌فرض پروژه', 'وضعیت اولیه پروژه جدید', 'select', '["active","completed","cancelled"]')
ON CONFLICT (section, key) DO NOTHING;

INSERT INTO app_settings (section, key, value, label, description, type) VALUES
('project', 'project_task_statuses', '["pending","in_progress","completed","cancelled"]', 'وضعیت‌های وظیفه', 'لیست وضعیت‌های مجاز برای وظایف پروژه', 'json'),
('project', 'project_task_priorities', '["low","medium","high"]', 'اولویت‌های وظیفه', 'لیست اولویت‌های مجاز برای وظایف پروژه', 'json'),
('project', 'auto_add_manager_as_member', 'true', 'افزودن خودکار مدیر به اعضا', 'آیا مدیر پروژه به صورت خودکار به اعضا اضافه شود؟', 'boolean')
ON CONFLICT (section, key) DO NOTHING;
