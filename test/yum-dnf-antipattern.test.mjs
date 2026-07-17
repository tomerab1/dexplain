import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDockerfile } from '../lib/collect/dockerfile-parse.mjs';
import yumDnfAntipattern from '../lib/rules/yum-dnf-antipattern.mjs';

const df = (text) => ({ dockerfile: parseDockerfile(text) });

test('yum-dnf-antipattern flags yum install without cleanup', () => {
  const findings = yumDnfAntipattern.evaluate(df('FROM centos:7\nRUN yum install -y httpd\n'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].evidence.manager, 'yum');
  assert.ok(/yum install leaves package cache/.test(findings[0].title));
  assert.equal(findings[0].location.line, 2);
});

test('yum-dnf-antipattern ignores yum install with cleanup', () => {
  const findings = yumDnfAntipattern.evaluate(
    df('FROM centos:7\nRUN yum install -y git && yum clean all\n'),
  );
  assert.equal(findings.length, 0);
});

test('yum-dnf-antipattern flags dnf install without cleanup', () => {
  const findings = yumDnfAntipattern.evaluate(df('FROM fedora:38\nRUN dnf -y install git\n'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].evidence.manager, 'dnf');
  assert.ok(/dnf install leaves package cache/.test(findings[0].title));
});

test('yum-dnf-antipattern ignores dnf install with cleanup', () => {
  const findings = yumDnfAntipattern.evaluate(
    df('FROM fedora:38\nRUN dnf -y install git && dnf clean all\n'),
  );
  assert.equal(findings.length, 0);
});

test('yum-dnf-antipattern flags microdnf install without cleanup', () => {
  const findings = yumDnfAntipattern.evaluate(df('FROM fedora:38\nRUN microdnf install curl\n'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].evidence.manager, 'microdnf');
  assert.ok(/microdnf install leaves package cache/.test(findings[0].title));
});

test('yum-dnf-antipattern ignores microdnf install with cleanup', () => {
  const findings = yumDnfAntipattern.evaluate(
    df('FROM fedora:38\nRUN microdnf install curl && microdnf clean all\n'),
  );
  assert.equal(findings.length, 0);
});

test('yum-dnf-antipattern ignores install with cache mount', () => {
  const findings = yumDnfAntipattern.evaluate(
    df('FROM fedora:38\nRUN --mount=type=cache,target=/var/cache/dnf dnf -y install git\n'),
  );
  assert.equal(findings.length, 0);
});

test('yum-dnf-antipattern ignores yum update (not install)', () => {
  const findings = yumDnfAntipattern.evaluate(df('FROM centos:7\nRUN yum update\n'));
  assert.equal(findings.length, 0);
});

test('yum-dnf-antipattern matches flags between command and subcommand', () => {
  const findings = yumDnfAntipattern.evaluate(df('FROM fedora:38\nRUN dnf --setopt=install_weak_deps=false install bash\n'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].evidence.manager, 'dnf');
});
