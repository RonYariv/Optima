{{/*
Expand the name of the chart.
*/}}
{{- define "agent-optima.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully-qualified app name.
*/}}
{{- define "agent-optima.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart label.
*/}}
{{- define "agent-optima.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to every resource.
*/}}
{{- define "agent-optima.labels" -}}
helm.sh/chart: {{ include "agent-optima.chart" . }}
{{ include "agent-optima.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels (used in matchLabels + Service selectors).
Callers must add app.kubernetes.io/component themselves.
*/}}
{{- define "agent-optima.selectorLabels" -}}
app.kubernetes.io/name: {{ include "agent-optima.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Name of the Secret that holds jwt-secret and database-url.
*/}}
{{- define "agent-optima.secretName" -}}
{{- if .Values.secret.existingSecret }}
{{- .Values.secret.existingSecret }}
{{- else }}
{{- include "agent-optima.fullname" . }}-secrets
{{- end }}
{{- end }}

{{/*
Resolve image tag: global.imageTag overrides per-service tag.
Usage: {{ include "agent-optima.imageTag" (dict "global" .Values.global "svc" .Values.images.apiGateway) }}
*/}}
{{- define "agent-optima.imageTag" -}}
{{- if .global.imageTag }}
{{- .global.imageTag }}
{{- else }}
{{- .svc.tag }}
{{- end }}
{{- end }}

{{/*
Common environment variables shared by all Node.js services.
Callers should include this block inside their env: list.
*/}}
{{- define "agent-optima.commonEnv" -}}
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: {{ include "agent-optima.secretName" . }}
      key: database-url
- name: DATABASE_SSL
  value: {{ .Values.database.ssl | quote }}
- name: NODE_ENV
  value: "production"
{{- end }}
