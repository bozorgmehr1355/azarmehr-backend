-- جدول اسناد سفارش (فیش، چک، مدارک)
CREATE TABLE IF NOT EXISTS order_documents (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES crm_orders(id) ON DELETE CASCADE,
  customer_id BIGINT NOT NULL REFERENCES crm_customers(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'receipt' | 'check' | 'id_card' | 'other'
  file_data TEXT NOT NULL, -- base64 encoded
  file_size INTEGER, -- bytes
  mime_type TEXT, -- 'image/jpeg', 'application/pdf'
  status TEXT DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  admin_note TEXT, -- دلیل رد یا توضیحات
  uploaded_by BIGINT NOT NULL, -- customer user_id
  reviewed_by BIGINT, -- admin user_id
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- ایندکس برای جستجوی سریع
CREATE INDEX IF NOT EXISTS idx_order_documents_order_id ON order_documents(order_id);
CREATE INDEX IF NOT EXISTS idx_order_documents_customer_id ON order_documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_documents_status ON order_documents(status);
-- جدول چت سفارش (مشتری ↔ تیم)
CREATE TABLE IF NOT EXISTS order_chat (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES crm_orders(id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL, -- customer_id یا admin user_id
  sender_type TEXT NOT NULL, -- 'customer' | 'admin'
  sender_name TEXT NOT NULL, -- نام فرستنده
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- ایندکس برای جستجوی سریع
CREATE INDEX IF NOT EXISTS idx_order_chat_order_id ON order_chat(order_id);
CREATE INDEX IF NOT EXISTS idx_order_chat_created_at ON order_chat(created_at DESC);
-- RLS: دسترسی از طریق Node.js API کنترل می‌شود (service role)
-- جدول‌ها بدون RLS فعال — authorization در لایه API انجام می‌شه
-- در صورت نیاز به RLS، باید ستون auth_user_id UUID به crm_customers اضافه شود
-- Trigger برای به‌روزرسانی updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS update_order_documents_updated_at ON order_documents;
CREATE TRIGGER update_order_documents_updated_at
  BEFORE UPDATE ON order_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
