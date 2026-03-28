#!/usr/bin/env node
// =====================================================================
// INTEROHRIGIN HR — Auth 사용자 마이그레이션 (FREE → PRO)
// 실행: node scripts/migrate-auth.mjs
// =====================================================================

import pg from 'pg';
const { Client } = pg;

// ─── 소스 (FREE) — Session mode pooler ──────────────────────────────
const SOURCE = {
  host: 'aws-0-ap-northeast-2.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.jlgdbofwlmhjayyjtyxv',
  password: 'djEKlyLgAYAZsFdd',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000
};

// ─── 대상 (PRO) — Session mode pooler ───────────────────────────────
const TARGET = {
  host: 'aws-0-ap-northeast-2.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.ckzbzumycmgkcpyhlclb',
  password: 'yTcUX8J7U79WzAxr',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000
};

async function migrate() {
  const src = new Client(SOURCE);
  const tgt = new Client(TARGET);

  try {
    console.log('📡 소스 DB 연결 중...');
    await src.connect();
    console.log('✅ 소스 DB 연결 성공\n');

    console.log('📡 대상 DB 연결 중...');
    await tgt.connect();
    console.log('✅ 대상 DB 연결 성공\n');

    // ─── 1. auth.users 내보내기 ─────────────────────────────────
    console.log('📦 auth.users 내보내기...');
    const { rows: users } = await src.query(`
      SELECT id, instance_id, aud, role, email,
             encrypted_password, email_confirmed_at, invited_at,
             confirmation_token, confirmation_sent_at,
             recovery_token, recovery_sent_at,
             email_change_token_new, email_change, email_change_sent_at,
             last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
             is_super_admin, created_at, updated_at,
             phone, phone_confirmed_at, phone_change,
             phone_change_token, phone_change_sent_at,
             email_change_token_current, email_change_confirm_status,
             banned_until, reauthentication_token, reauthentication_sent_at,
             is_sso_user, deleted_at, is_anonymous
      FROM auth.users
      ORDER BY created_at
    `);
    console.log(`  → ${users.length}명 사용자 확인\n`);

    // ─── 2. auth.identities 내보내기 ────────────────────────────
    console.log('📦 auth.identities 내보내기...');
    const { rows: identities } = await src.query(`
      SELECT id, user_id, provider_id, provider,
             identity_data, last_sign_in_at,
             created_at, updated_at
      FROM auth.identities
      ORDER BY created_at
    `);
    console.log(`  → ${identities.length}개 identity 확인\n`);

    // ─── 3. 대상 DB auth 정리 ───────────────────────────────────
    console.log('🗑️  대상 DB 기존 auth 데이터 정리...');
    await tgt.query('DELETE FROM auth.identities');
    await tgt.query('DELETE FROM auth.users');
    console.log('  → 정리 완료\n');

    // ─── 4. auth.users 가져오기 ─────────────────────────────────
    console.log('📥 auth.users 가져오기...');
    let userCount = 0;
    for (const u of users) {
      try {
        await tgt.query(`
          INSERT INTO auth.users (
            id, instance_id, aud, role, email,
            encrypted_password, email_confirmed_at, invited_at,
            confirmation_token, confirmation_sent_at,
            recovery_token, recovery_sent_at,
            email_change_token_new, email_change, email_change_sent_at,
            last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
            is_super_admin, created_at, updated_at,
            phone, phone_confirmed_at, phone_change,
            phone_change_token, phone_change_sent_at,
            email_change_token_current, email_change_confirm_status,
            banned_until, reauthentication_token, reauthentication_sent_at,
            is_sso_user, deleted_at, is_anonymous
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
            $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
            $31,$32,$33,$34
          )
        `, [
          u.id, u.instance_id, u.aud, u.role, u.email,
          u.encrypted_password, u.email_confirmed_at, u.invited_at,
          u.confirmation_token, u.confirmation_sent_at,
          u.recovery_token, u.recovery_sent_at,
          u.email_change_token_new, u.email_change, u.email_change_sent_at,
          u.last_sign_in_at, u.raw_app_meta_data, u.raw_user_meta_data,
          u.is_super_admin, u.created_at, u.updated_at,
          u.phone, u.phone_confirmed_at, u.phone_change,
          u.phone_change_token, u.phone_change_sent_at,
          u.email_change_token_current, u.email_change_confirm_status,
          u.banned_until, u.reauthentication_token, u.reauthentication_sent_at,
          u.is_sso_user, u.deleted_at, u.is_anonymous
        ]);
        userCount++;
        console.log(`  ✅ ${u.email} (${u.raw_user_meta_data?.name || 'N/A'})`);
      } catch (err) {
        console.error(`  ❌ ${u.email}: ${err.message}`);
      }
    }
    console.log(`\n  → ${userCount}/${users.length}명 완료\n`);

    // ─── 5. auth.identities 가져오기 ────────────────────────────
    console.log('📥 auth.identities 가져오기...');
    let idCount = 0;
    for (const i of identities) {
      try {
        await tgt.query(`
          INSERT INTO auth.identities (
            id, user_id, provider_id, provider,
            identity_data, last_sign_in_at,
            created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `, [
          i.id, i.user_id, i.provider_id, i.provider,
          i.identity_data, i.last_sign_in_at,
          i.created_at, i.updated_at
        ]);
        idCount++;
      } catch (err) {
        console.error(`  ❌ identity ${i.id}: ${err.message}`);
      }
    }
    console.log(`  → ${idCount}/${identities.length}개 완료\n`);

    // ─── 6. 검증 ────────────────────────────────────────────────
    console.log('🔍 검증 중...');
    const { rows: [srcCount] } = await src.query('SELECT COUNT(*) as cnt FROM auth.users');
    const { rows: [tgtCount] } = await tgt.query('SELECT COUNT(*) as cnt FROM auth.users');
    const { rows: [srcIdCount] } = await src.query('SELECT COUNT(*) as cnt FROM auth.identities');
    const { rows: [tgtIdCount] } = await tgt.query('SELECT COUNT(*) as cnt FROM auth.identities');

    console.log(`\n  auth.users:      소스 ${srcCount.cnt} → 대상 ${tgtCount.cnt} ${srcCount.cnt === tgtCount.cnt ? '✅' : '❌'}`);
    console.log(`  auth.identities: 소스 ${srcIdCount.cnt} → 대상 ${tgtIdCount.cnt} ${srcIdCount.cnt === tgtIdCount.cnt ? '✅' : '❌'}`);

    console.log('\n====================================');
    console.log('Auth 마이그레이션 완료!');
    console.log('====================================');

  } catch (err) {
    console.error('❌ 오류:', err.message);
  } finally {
    await src.end();
    await tgt.end();
  }
}

migrate();
