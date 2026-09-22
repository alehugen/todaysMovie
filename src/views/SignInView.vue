<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { useUserProfileStore } from '@/stores/userProfile'

const name = ref('')
const errorMessage = ref('')

const router = useRouter()
const userProfile = useUserProfileStore()

function handleSubmit() {
  if (!userProfile.signIn(name.value)) {
    errorMessage.value = 'Please enter your name to continue.'
    return
  }

  router.push({ name: 'onboarding' })
}
</script>

<template>
  <section class="mx-auto max-w-md">
    <h1 class="text-3xl font-semibold tracking-tight">Welcome</h1>
    <p class="mt-2 text-muted">
      Tell us your name, rate a few movies, and we will train a model right here in your browser.
    </p>

    <form class="mt-8 flex flex-col gap-3" @submit.prevent="handleSubmit">
      <label for="name" class="text-sm font-medium">Your name</label>

      <input
        id="name"
        v-model="name"
        type="text"
        autocomplete="given-name"
        placeholder="Ada Lovelace"
        :aria-invalid="Boolean(errorMessage)"
        class="focus-ring rounded-control border border-outline bg-raised px-3 py-2 transition-colors placeholder:text-muted"
        @input="errorMessage = ''"
      />

      <p v-if="errorMessage" class="text-sm text-danger">{{ errorMessage }}</p>

      <button
        type="submit"
        class="focus-ring mt-2 cursor-pointer rounded-control bg-brand px-4 py-2 font-medium text-brand-contrast transition-colors hover:bg-brand-hover"
      >
        Get started
      </button>
    </form>
  </section>
</template>
