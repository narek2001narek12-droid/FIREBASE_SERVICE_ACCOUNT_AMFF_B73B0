# Автодеплой в Firebase через GitHub Actions

## 1) Подготовка репозитория
1. Загрузите проект в GitHub (ветка `main` или `master`).
2. Убедитесь, что файл `.github/workflows/firebase-deploy.yml` находится в репозитории.

## 2) Создайте Service Account JSON (рекомендуемый способ)
Firebase Console → Project settings → **Service accounts** → **Generate new private key**.

Скопируйте содержимое JSON и добавьте в GitHub:
Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

- Name: `FIREBASE_SERVICE_ACCOUNT_AMFF_B73B0`
- Value: полный JSON

## 3) Что деплоится
Workflow деплоит:
- Hosting (static, `public: "."`)
- Cloud Functions (папка `functions/`)

Триггер: `push` в `main`/`master`.

## 4) Важно про ключи
Файл `functions/serviceAccountKey.json` удалён и добавлен в `.gitignore`.
Если вы когда-либо коммитили приватный ключ в GitHub, **сразу отзовите** его в Google Cloud (IAM → Service Accounts → Keys) и создайте новый.
